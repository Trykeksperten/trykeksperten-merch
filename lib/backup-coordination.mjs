import {AsyncLocalStorage} from 'node:async_hooks';
const busy=()=>Object.assign(new Error('Backup coordination is busy.'),{code:'BACKUP_BUSY'});
// Count nested work independently: detached mail work must outlive its HTTP parent.
// An inherited context whose last lease ended cannot admit late work during a freeze.
export function createBackupGate(){
 const ownership=new AsyncLocalStorage();let active=0,frozen=false;const drained=new Set();
 const gate={
  snapshot:()=>({active,paused:frozen}),
  async run(task){
   if(typeof task!=='function')throw TypeError('Operation required.');
   let owner=ownership.getStore();const inherited=owner?.refs>0;
   if(frozen&&!inherited)throw busy();
   if(!inherited)owner={refs:0};owner.refs++;active++;
   try{return await ownership.run(owner,task);}
   finally{owner.refs--;active--;if(!active)for(const resolve of [...drained])resolve();}
  },
  async background(task){if(frozen&&!ownership.getStore()?.refs)return {skipped:true};return gate.run(task);},
  async exclusive(task,{drainTimeoutMs=10000}={}){
   if(frozen||ownership.getStore()?.refs)throw busy();
   if(!Number.isSafeInteger(drainTimeoutMs)||drainTimeoutMs<1||drainTimeoutMs>60000)throw Error('Invalid drain deadline.');
   frozen=true;let timer,notify;
   try{
    if(active)await new Promise((resolve,reject)=>{
     notify=resolve;drained.add(notify);timer=setTimeout(()=>reject(busy()),drainTimeoutMs);
    });
    clearTimeout(timer);if(notify)drained.delete(notify);
    // The task owns its cancellation; never race it against a timeout and reopen
    // while a snapshot child can still be copying data.
    return await task();
   }finally{clearTimeout(timer);if(notify)drained.delete(notify);frozen=false;}
  }
 };
 return gate;
}

// One attempt at a time, UTC schedule and bounded retries. A failure never moves
// the successful day marker, and restart can resume from an actual saved receipt.
export function createDailyBackupSchedule({run,now=Date.now,lastSuccessAt=null,hourUTC=2,retryMs=10*60_000,maxAttempts=3,onError=()=>{}}={}){
 if(typeof run!=='function'||!Number.isInteger(hourUTC)||hourUTC<0||hourUTC>23||!Number.isSafeInteger(retryMs)||retryMs<1||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw Error('Invalid backup schedule.');
 let running=false,day=null,attempts=0,nextAttempt=0,success=Date.parse(lastSuccessAt);
 if(lastSuccessAt!==null&&!Number.isFinite(success))throw Error('Invalid successful backup receipt.');
 return {snapshot:()=>({running,attempts,nextAttempt,lastSuccessAt:Number.isFinite(success)?new Date(success).toISOString():null}),async tick(){
  const at=now();if(!Number.isFinite(at))throw Error('Invalid backup clock.');
  const date=new Date(at),start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hourUTC);
  if(at<start||success>=start||running)return {skipped:true};
  if(day!==start){day=start;attempts=0;nextAttempt=0;}
  if(at<nextAttempt||attempts>=maxAttempts)return {skipped:true};
  running=true;attempts++;
  try{const receipt=await run();const stamp=Date.parse(receipt?.verifiedAt);
   if(!receipt?.verified||!Number.isFinite(stamp)||stamp<start||stamp>now())throw Error('Backup was not verified.');
   success=stamp;return {verified:true};
  }catch{nextAttempt=at+retryMs;onError({event:'backup_failure',code:'backup_not_verified'});return {verified:false};}
  finally{running=false;}
 }};
}
