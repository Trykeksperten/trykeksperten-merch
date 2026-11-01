import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerMonitor} from '../lib/worker-monitor.mjs';
test('worker failures are visible without exception data, and recovery clears the failure count',async()=>{
 const logs=[],monitor=createWorkerMonitor({now:()=>1000,log:r=>logs.push(r)});
 await monitor.run('proof_mail',()=>{throw Error('SECRET customer@example.test');});
 assert.equal(monitor.snapshot().find(x=>x.name==='proof_mail').consecutiveFailures,1);
 assert.equal(JSON.stringify(logs).includes('SECRET'),false);
 await monitor.run('proof_mail',()=>{});
 const state=monitor.snapshot().find(x=>x.name==='proof_mail');
 assert.equal(state.consecutiveFailures,0);assert.ok(state.lastFailedAt);assert.ok(state.lastSucceededAt);
 assert.deepEqual(logs.map(x=>x.event),['worker_failure','worker_recovered']);
});
test('pending worker does not overlap itself and failure does not suppress other workers',async()=>{
 const monitor=createWorkerMonitor({log:()=>{}});let finish,calls=0;
 const pending=monitor.run('sales_finance',()=>new Promise(resolve=>{calls++;finish=resolve;}));
 await monitor.run('sales_finance',()=>{calls++;});assert.equal(calls,1);
 await monitor.run('proof_mail',()=>{throw Error('failure');});
 assert.equal(monitor.snapshot().find(x=>x.name==='sales_finance').running,true);
 finish();await pending;
 await monitor.run('sales_finance',()=>{calls++;});assert.equal(calls,2);
});
