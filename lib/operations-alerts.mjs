// Offline evaluator: fixed codes only; never forwards records, errors, IDs or customer data.
const scopes=new Set(['pf-prices.json','pf-stock.json','pf-popularity.json','proof-mail','order-mail','shipment-mail','proof-mailbox']);
const codes=new Set(['POPULARITY_STALE','COMMERCE_FEED_STALE','MAIL_RECONCILIATION_REQUIRED','MAIL_SENDING_STALE','MAIL_PENDING_STALE','MAILBOX_INTENTIONALLY_PAUSED','MAILBOX_CHECK_STALE','MAILBOX_LOCK_REQUIRES_RECONCILIATION','FINANCE_RECONCILIATION_REQUIRED','DISK_SPACE_LOW','MEMORY_PRESSURE','RECORDS_CHANGED_DURING_READ']);
const fields=new Set(['productDate','printDate','updatedAt']);
const statuses=new Set(['uncertain','blocked','failed','sending']);
const advisory=new Set(['POPULARITY_STALE','FEED_SYNC_LATE','MEMORY_PRESSURE','METRICS_UNAVAILABLE']);
export const alertDefaults=Object.freeze({intervalSeconds:300,maxSnapshotAgeSeconds:600,expectedMailboxPaused:true});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const stamp=v=>typeof v==='string'?Date.parse(v):NaN;
export function evaluateOperationsAlerts({snapshot,previous=null,now=Date.now(),expectedMailboxPaused=true}={}){
 if(!Number.isFinite(now)||typeof expectedMailboxPaused!=='boolean')throw Error('Invalid monitor configuration');
 // Reconstruct state from a restricted schema, even when the state file is tampered with.
 const clean={};
 const validKey=k=>/^(?:HEALTH_UNAVAILABLE|MONITOR_INPUT_INVALID|METRICS_UNAVAILABLE|MAILBOX_UNEXPECTEDLY_PAUSED|MAILBOX_EXPECTATION_MISMATCH|MAILBOX_CHECK_STALE|FEED_SYNC_LATE|POPULARITY_STALE|COMMERCE_FEED_STALE|MAIL_RECONCILIATION_REQUIRED|MAIL_SENDING_STALE|MAIL_PENDING_STALE|MAILBOX_LOCK_REQUIRES_RECONCILIATION|FINANCE_RECONCILIATION_REQUIRED|DISK_SPACE_LOW|MEMORY_PRESSURE|RECORDS_CHANGED_DURING_READ)(?::(?:pf-prices.json|pf-stock.json|pf-popularity.json|proof-mail|order-mail|shipment-mail|proof-mailbox))?(?::(?:productDate|printDate|updatedAt|uncertain|blocked|failed|sending))?$/.test(k);
 if(previous!==null){
  if(!object(previous)||previous.version!==1||!Number.isFinite(stamp(previous.lastObservedAt))||stamp(previous.lastObservedAt)>now||!object(previous.conditions))throw Error('Invalid monitor state');
  for(const [key,row] of Object.entries(previous.conditions)){
   if(!validKey(key)||!object(row)||typeof row.active!=='boolean'||!Number.isSafeInteger(row.bad)||row.bad<0||row.bad>2||!Number.isSafeInteger(row.good)||row.good<0||row.good>2||!Number.isFinite(stamp(row.since))||stamp(row.since)>now)throw Error('Invalid monitor state');
   clean[key]={active:row.active,bad:row.bad,good:row.good,since:new Date(stamp(row.since)).toISOString()};
  }
 }
 const at=new Date(now).toISOString(),observedAt=stamp(snapshot?.checkedAt),last=stamp(previous?.lastObservedAt);
 if(Number.isFinite(observedAt)&&observedAt<=now&&now-observedAt<=alertDefaults.maxSnapshotAgeSeconds*1000&&observedAt<=last)return {state:{version:1,lastObservedAt:new Date(last).toISOString(),conditions:clean},events:[],duplicate:true};
 const metric=snapshot?.memory,disk=snapshot?.disk,hasMemory=object(metric)&&Number.isFinite(metric.currentBytes)&&metric.currentBytes>=0&&Number.isFinite(metric.limitBytes)&&metric.limitBytes>0,hasDisk=object(disk)&&Number.isFinite(disk.availableBytes)&&Number.isFinite(disk.totalBytes)&&disk.totalBytes>0;
 const failures=new Set();let valid=object(snapshot)&&Number.isFinite(observedAt)&&observedAt<=now&&now-observedAt<=alertDefaults.maxSnapshotAgeSeconds*1000&&Array.isArray(snapshot.findings)&&object(snapshot.feeds)&&object(snapshot.mailbox);
 if(valid){
  for(const row of snapshot.findings){
   if(!object(row)||!codes.has(row.code)||(row.scope!==undefined&&!scopes.has(row.scope))||(row.field!==undefined&&!fields.has(row.field))||(row.status!==undefined&&!statuses.has(row.status))){valid=false;break;}
  }
 }
 if(!valid)failures.add('MONITOR_INPUT_INVALID');
 else{
  if(snapshot.healthHTTP!==200)failures.add('HEALTH_UNAVAILABLE');
  for(const row of snapshot.findings){
   if(row.code==='MEMORY_PRESSURE')continue; // duration-based below
   if(row.code==='MAILBOX_INTENTIONALLY_PAUSED'){if(!expectedMailboxPaused)failures.add('MAILBOX_UNEXPECTEDLY_PAUSED');continue;}
   // An old check does not indicate failure while the mailbox is deliberately paused.
   if(row.code==='MAILBOX_CHECK_STALE'&&expectedMailboxPaused&&snapshot.mailbox.paused===true)continue;
   const key=[row.code,row.scope,row.field||row.status].filter(Boolean).join(':');failures.add(key);
  }
  if(snapshot.mailbox.enabled&&snapshot.mailbox.paused===true&&!expectedMailboxPaused)failures.add('MAILBOX_UNEXPECTEDLY_PAUSED');
  if(expectedMailboxPaused&&snapshot.mailbox.enabled&&snapshot.mailbox.paused!==true)failures.add('MAILBOX_EXPECTATION_MISMATCH');
  if(!expectedMailboxPaused&&snapshot.mailbox.enabled&&(!Number.isFinite(stamp(snapshot.mailbox.lastCheckedAt))||now-stamp(snapshot.mailbox.lastCheckedAt)>300000))failures.add('MAILBOX_CHECK_STALE:proof-mailbox');
  for(const name of ['pf-prices.json','pf-stock.json']){const feed=snapshot.feeds[name];if(!object(feed)||feed.present!==true||!Number.isFinite(feed.modifiedAgeSeconds)||feed.modifiedAgeSeconds>7200)failures.add('FEED_SYNC_LATE:'+name);}
  if(!hasMemory||!hasDisk)failures.add('METRICS_UNAVAILABLE');
  if(hasMemory&&metric.currentBytes/metric.limitBytes>.8)failures.add('MEMORY_PRESSURE');
  if(hasDisk&&(disk.availableBytes<512*1024*1024||disk.availableBytes/disk.totalBytes<.1))failures.add('DISK_SPACE_LOW');
 }
 // Failed/malformed reads cannot resolve existing incidents: only a valid sample may do so.
 const keys=new Set([...Object.keys(clean),...failures]),conditions={},events=[];
 for(const key of keys){
  const old=clean[key]||{active:false,bad:0,good:0,since:at};
  if((!valid&&key!=='MONITOR_INPUT_INVALID')||(valid&&((key==='MEMORY_PRESSURE'&&!hasMemory)||(key==='DISK_SPACE_LOW'&&!hasDisk)))){conditions[key]=old;continue;}
  const bad=failures.has(key),row=bad?{active:old.active,bad:Math.min(2,old.bad+1),good:0,since:old.bad?old.since:at}:{...old,bad:0,good:Math.min(2,old.good+1)};
  const sustained=key!=='MEMORY_PRESSURE'||now-stamp(row.since)>=300000;
  if(bad&&!row.active&&row.bad>=2&&sustained){row.active=true;events.push({type:'incident',code:key,severity:advisory.has(key.split(':')[0])?'warning':'critical',at});}
  if(!bad&&row.active&&row.good>=2){row.active=false;events.push({type:'recovered',code:key,severity:'info',at});}
  if(row.active||bad)conditions[key]=row;
 }
 return {state:{version:1,lastObservedAt:Number.isFinite(observedAt)&&valid?new Date(observedAt).toISOString():at,conditions},events,duplicate:false};
}
