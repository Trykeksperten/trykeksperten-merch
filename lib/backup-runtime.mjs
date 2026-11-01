import {mkdir,lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createBackupGate,createDailyBackupSchedule} from './backup-coordination.mjs';
import {createB2BackupStorage} from './b2-backup-storage.mjs';
import {runAutomaticBackup,privateBackupWorkRoot} from './automatic-backup.mjs';
const configError=()=>Object.assign(new Error('Invalid automatic backup configuration.'),{code:'BACKUP_CONFIG_INVALID'});
export function backupConfiguration(env={}){
 if(env.SMERCH_BACKUP_ENABLED===undefined||env.SMERCH_BACKUP_ENABLED==='0')return {enabled:false};
 if(env.SMERCH_BACKUP_ENABLED!=='1'||env.SMERCH_BACKUP_TRANSFER_APPROVED!=='1'||env.SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED!=='1'||env.SMERCH_DATABASE_ENABLED==='1'||(env.WEB_CONCURRENCY&&env.WEB_CONCURRENCY!=='1'))throw configError();
 const config={enabled:true,source:env.SMERCH_DATA_DIR,workRoot:env.SMERCH_BACKUP_WORK_DIR,certificate:env.SMERCH_BACKUP_CERTIFICATE,certificateSha256:env.SMERCH_BACKUP_CERT_SHA256,credentialsPath:env.SMERCH_BACKUP_CREDENTIALS,accountId:env.SMERCH_BACKUP_B2_ACCOUNT_ID,bucketId:env.SMERCH_BACKUP_B2_BUCKET_ID};
 if(![config.source,config.workRoot,config.certificate,config.credentialsPath].every(v=>typeof v==='string'&&isAbsolute(v))||!/^[a-f0-9]{64}$/.test(config.certificateSha256||'')||!/^[a-f0-9]{12}$/.test(config.accountId||'')||!/^[a-f0-9]{24}$/.test(config.bucketId||''))throw configError();
 return config;
}
export function createBackupRuntime({env=process.env,now=Date.now,log=row=>console.error(JSON.stringify(row)),store,cycle=runAutomaticBackup}={}){
 const config=backupConfiguration(env),gate=createBackupGate();let scheduler,timer,initialTimer,running=null,lastSuccess=null,lastFailureAt=null,started=false;
 const status=()=>({enabled:config.enabled,running:!!running,lastSucceededAt:lastSuccess?.verifiedAt||null,lastFailedAt:lastFailureAt,alertsEnabled:false});
 const runtime={enabled:config.enabled,gate,status,
  runOperation:task=>config.enabled?gate.run(task):task(),
  runBackground:task=>config.enabled?gate.background(task):task(),
  async runNow(){
   if(!config.enabled)throw configError();if(running)throw Object.assign(Error('Backup busy.'),{code:'BACKUP_BUSY'});
   running=(async()=>{
    let ownLock=false,lock;const token=randomUUID();
    try{
     const {work}=await privateBackupWorkRoot(config.source,config.workRoot);lock=join(work,'backup-run.lock');
     // No automatic stale-lock removal. A crashed/unknown writer requires review.
     await mkdir(lock,{mode:0o700});ownLock=true;await writeFile(join(lock,'owner'),token,{flag:'wx',mode:0o600});
     const provider=store||createB2BackupStorage({...config,credentials:async()=>{
      const stat=await lstat(config.credentialsPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077||stat.size>4096)throw configError();return JSON.parse(await readFile(config.credentialsPath,'utf8'));
     }});
     const receipt=await cycle({...config,gate,store:provider,environment:{...env},sourceCommit:env.RENDER_GIT_COMMIT,now,saveReceipt:async row=>{
      const path=join(config.source,'backup-status.json'),temporary=path+'.'+randomUUID()+'.tmp';
      try{await writeFile(temporary,JSON.stringify(row),{flag:'wx',mode:0o600});await rename(temporary,path);}finally{await rm(temporary,{force:true});}
     }});
     if(!receipt?.verified||!Number.isFinite(Date.parse(receipt.verifiedAt)))throw Error('Backup not verified.');
     lastSuccess=receipt;lastFailureAt=null;log({event:'backup_verified',at:receipt.verifiedAt});return receipt;
    }catch(error){lastFailureAt=new Date(now()).toISOString();throw error;}
    finally{if(ownLock){try{if(await readFile(join(lock,'owner'),'utf8')===token)await rm(lock,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}}
   })();
   try{return await running;}finally{running=null;}
  },
  async start(){
   if(!config.enabled||started)return;started=true;
   try{const saved=JSON.parse(await readFile(join(config.source,'backup-status.json'),'utf8'));
    // A verified old receipt is scheduling evidence only for this exact bucket.
    if(saved.version===1&&saved.verified===true&&saved.bucketId===config.bucketId&&Number.isFinite(Date.parse(saved.verifiedAt))&&Date.parse(saved.verifiedAt)<=now())lastSuccess=saved;
   }catch{}
   scheduler=createDailyBackupSchedule({now,lastSuccessAt:lastSuccess?.verifiedAt||null,run:()=>runtime.runNow(),onError:log});
   const tick=()=>{void scheduler.tick().catch(()=>log({event:'backup_failure',code:'backup_scheduler_failed'}));};
   initialTimer=setTimeout(tick,10000);initialTimer.unref();timer=setInterval(tick,60000);timer.unref();
  },
  async stop(){clearTimeout(initialTimer);clearInterval(timer);if(running)await running.catch(()=>{});}
 };
 return runtime;
}
