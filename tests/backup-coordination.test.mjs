import test from 'node:test';import assert from 'node:assert/strict';
import {createBackupGate,createDailyBackupSchedule} from '../lib/backup-coordination.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('freeze drains a multi-file transaction, rejects new work and resumes after snapshot failure',async()=>{
 const gate=createBackupGate(),between=deferred(),started=deferred(),rows=[];
 const writer=gate.run(async()=>{rows.push('order');started.resolve();await between.promise;rows.push('checkout');});await started.promise;
 let copied=false;const backup=gate.exclusive(async()=>{assert.deepEqual(rows,['order','checkout']);copied=true;throw Error('copy failed');});
 await assert.rejects(gate.run(()=>rows.push('new order')),{code:'BACKUP_BUSY'});assert.equal(copied,false);
 assert.deepEqual(await gate.background(()=>rows.push('timer')),{skipped:true});
 between.resolve();await writer;await assert.rejects(backup,/copy failed/);assert.equal(copied,true);
 await gate.run(()=>rows.push('next'));assert.deepEqual(gate.snapshot(),{active:0,paused:false});
});
test('nested async work may finish while draining; detached descendants retain their own lease',async()=>{
 const gate=createBackupGate(),finish=deferred(),nested=deferred();let mail;
 await gate.run(async()=>{mail=gate.run(async()=>{await nested.promise;await gate.run(async()=>{await finish.promise;});});});
 let copied=false;const backup=gate.exclusive(async()=>{copied=true;});assert.equal(gate.snapshot().active,1);
 nested.resolve();await new Promise(r=>setImmediate(r));assert.equal(copied,false);finish.resolve();await mail;await backup;
 assert.equal(copied,true);
});
test('late detached context cannot bypass a later freeze after its lease has ended',async()=>{
 const gate=createBackupGate(),start=deferred(),finish=deferred();let late;
 await gate.run(async()=>{late=(async()=>{await start.promise;return gate.run(()=>{throw Error('must not start');});})();});
 const frozen=gate.exclusive(()=>finish.promise);start.resolve();await assert.rejects(late,{code:'BACKUP_BUSY'});finish.resolve();await frozen;
});
test('a drain timeout does not call the snapshot, does not cancel an active order, and opens admission again',async()=>{
 const gate=createBackupGate(),finish=deferred();const writer=gate.run(()=>finish.promise);let copies=0;
 await assert.rejects(gate.exclusive(()=>{copies++;},{drainTimeoutMs:10}),{code:'BACKUP_BUSY'});assert.equal(copies,0);
 await gate.run(()=>{});assert.equal(gate.snapshot().active,1);finish.resolve();await writer;
});
test('overlapping or reentrant snapshots fail rather than deadlock',async()=>{
 const gate=createBackupGate(),finish=deferred();await gate.run(async()=>assert.rejects(gate.exclusive(()=>{}),{code:'BACKUP_BUSY'}));
 const first=gate.exclusive(()=>finish.promise);await assert.rejects(gate.exclusive(()=>{}),{code:'BACKUP_BUSY'});finish.resolve();await first;
});
test('UTC daily schedule counts only verified success and does not overlap or retry indefinitely',async()=>{
 let at=Date.parse('2026-11-01T01:59:00Z'),calls=0,fail=true;const errors=[];
 const schedule=createDailyBackupSchedule({now:()=>at,retryMs:1000,maxAttempts:2,onError:e=>errors.push(e),run:async()=>{calls++;if(fail)throw Error('SECRET');return {verified:true,verifiedAt:new Date(at).toISOString()};}});
 assert.equal((await schedule.tick()).skipped,true);at+=60000;assert.equal((await schedule.tick()).verified,false);assert.equal(calls,1);
 await schedule.tick();assert.equal(calls,1);at+=1000;fail=false;assert.equal((await schedule.tick()).verified,true);await schedule.tick();assert.equal(calls,2);assert.doesNotMatch(JSON.stringify(errors),/SECRET/);
 at+=86400000;fail=true;await schedule.tick();at+=1000;await schedule.tick();at+=1000;await schedule.tick();assert.equal(calls,4);
});
test('schedule restores success after restart, catches up after missed start, and ignores false success',async()=>{
 let at=Date.parse('2026-11-01T12:00:00Z'),calls=0;
 const prior=createDailyBackupSchedule({now:()=>at,lastSuccessAt:'2026-11-01T03:00:00Z',run:async()=>{calls++;}});assert.equal((await prior.tick()).skipped,true);
 const finish=deferred();const next=createDailyBackupSchedule({now:()=>at,run:async()=>{calls++;await finish.promise;return {verified:false};}});const first=next.tick();assert.equal((await next.tick()).skipped,true);finish.resolve();assert.equal((await first).verified,false);assert.equal(next.snapshot().lastSuccessAt,null);assert.equal(calls,1);
});
