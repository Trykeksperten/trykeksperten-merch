import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {backupConfiguration,createBackupRuntime} from '../lib/backup-runtime.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'smerch-backup-runtime-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'data');await mkdir(source);return {root,source,env:{SMERCH_BACKUP_ENABLED:'1',SMERCH_BACKUP_TRANSFER_APPROVED:'1',SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED:'1',SMERCH_DATA_DIR:source,SMERCH_BACKUP_WORK_DIR:join(root,'work'),SMERCH_BACKUP_CERTIFICATE:join(root,'synthetic.pem'),SMERCH_BACKUP_CERT_SHA256:'c'.repeat(64),SMERCH_BACKUP_CREDENTIALS:join(root,'synthetic-key.json'),SMERCH_BACKUP_B2_ACCOUNT_ID:'a'.repeat(12),SMERCH_BACKUP_B2_BUCKET_ID:'b'.repeat(24),PF_GATEWAY_MODE:'test'}};}
test('default-disabled runtime performs no backup and does not read credentials or change PF settings',async()=>{
 const env=Object.freeze({PF_GATEWAY_MODE:'test',SMERCH_BACKUP_CREDENTIALS:'/must-not-read'}),runtime=createBackupRuntime({env,store:{get putAndVerify(){throw Error('must not read');}}});
 assert.deepEqual(backupConfiguration(env),{enabled:false});await runtime.start();await assert.rejects(runtime.runNow(),{code:'BACKUP_CONFIG_INVALID'});assert.equal(await runtime.runOperation(()=>7),7);await runtime.stop();assert.equal(env.PF_GATEWAY_MODE,'test');assert.deepEqual(runtime.status(),{enabled:false,running:false,lastSucceededAt:null,lastFailedAt:null,alertsEnabled:false});
});
test('missing approval, unknown flag, SQLite or multiworker configuration cannot enable backups',async t=>{
 const f=await fixture(t);
 for(const change of [{SMERCH_BACKUP_TRANSFER_APPROVED:'0'},{SMERCH_BACKUP_ENABLED:'true'},{SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED:undefined},{SMERCH_DATABASE_ENABLED:'1'},{WEB_CONCURRENCY:'2'}])assert.throws(()=>backupConfiguration({...f.env,...change}),{code:'BACKUP_CONFIG_INVALID'});
});
test('runtime writes only a verified receipt, rejects overlap and removes only its own temporary lock',async t=>{
 const f=await fixture(t),logs=[];let finish;const wait=new Promise(r=>{finish=r;});let started;const ready=new Promise(r=>{started=r;});
 const runtime=createBackupRuntime({env:f.env,log:r=>logs.push(r),store:{},cycle:async options=>{started();await wait;const row={version:1,verified:true,verifiedAt:new Date().toISOString(),bucketId:'b'.repeat(24),sha256:'c'.repeat(64)};await options.saveReceipt(row);return row;}});
 const first=runtime.runNow();await ready;await assert.rejects(runtime.runNow(),{code:'BACKUP_BUSY'});finish();await first;
 assert.equal(JSON.parse(await readFile(join(f.source,'backup-status.json'))).verified,true);await assert.rejects(access(join(f.env.SMERCH_BACKUP_WORK_DIR,'backup-run.lock')));assert.equal(runtime.status().running,false);assert.equal(f.env.PF_GATEWAY_MODE,'test');assert.equal(logs[0].event,'backup_verified');await runtime.stop();
});
test('an unknown existing lock is preserved and a failed cycle never replaces last success',async t=>{
 const f=await fixture(t);await mkdir(f.env.SMERCH_BACKUP_WORK_DIR,{mode:0o700});const lock=join(f.env.SMERCH_BACKUP_WORK_DIR,'backup-run.lock');await mkdir(lock);await writeFile(join(lock,'owner'),'someone-else');
 let called=false;const runtime=createBackupRuntime({env:f.env,store:{},cycle:async()=>{called=true;}});await assert.rejects(runtime.runNow());assert.equal(called,false);assert.equal(await readFile(join(lock,'owner'),'utf8'),'someone-else');await rm(lock,{recursive:true});
 const old='{"version":1,"verified":true,"marker":"old"}';await writeFile(join(f.source,'backup-status.json'),old);const failed=createBackupRuntime({env:f.env,store:{},cycle:async()=>{throw Error('SECRET');}});await assert.rejects(failed.runNow());assert.equal(await readFile(join(f.source,'backup-status.json'),'utf8'),old);assert.equal(failed.status().lastSucceededAt,null);assert.ok(failed.status().lastFailedAt);await failed.stop();
});
