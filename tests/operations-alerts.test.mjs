import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {evaluateOperationsAlerts as evaluate} from '../lib/operations-alerts.mjs';
const t0=Date.parse('2026-11-01T12:00:00Z');
const sample=(now=t0,patch={})=>({checkedAt:new Date(now).toISOString(),healthHTTP:200,findings:[],feeds:{'pf-prices.json':{present:true,modifiedAgeSeconds:60},'pf-stock.json':{present:true,modifiedAgeSeconds:60}},mailbox:{enabled:true,paused:true},disk:{totalBytes:10000000000,availableBytes:9000000000},memory:{currentBytes:50,limitBytes:100},...patch});
const next=(previous,now,patch={},config={})=>evaluate({previous,snapshot:sample(now,patch),now,...config});
test('health needs two distinct failures; repeated failures stay quiet and two successes recover',()=>{
 let r=next(null,t0,{healthHTTP:503});assert.deepEqual(r.events,[]);
 r=next(r.state,t0+300000,{healthHTTP:503});assert.equal(r.events[0].code,'HEALTH_UNAVAILABLE');assert.equal(r.events[0].type,'incident');
 r=next(r.state,t0+600000,{healthHTTP:503});assert.deepEqual(r.events,[]);
 r=next(r.state,t0+900000);assert.deepEqual(r.events,[]);
 r=next(r.state,t0+1200000);assert.equal(r.events[0].type,'recovered');
});
test('replayed observations cannot trigger incidents or clear active ones',()=>{
 const snap=sample(t0,{healthHTTP:503});let r=evaluate({snapshot:snap,now:t0});
 const duplicate=evaluate({snapshot:snap,previous:r.state,now:t0+1000});assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.events,[]);
});
test('stale or unreadable snapshots alarm without falsely recovering an active domain incident',()=>{
 let r=next(null,t0,{healthHTTP:503});r=next(r.state,t0+300000,{healthHTTP:503});
 r=evaluate({previous:r.state,snapshot:sample(t0),now:t0+1200000});
 r=evaluate({previous:r.state,snapshot:null,now:t0+1500000});
 assert.equal(r.events[0].code,'MONITOR_INPUT_INVALID');assert.equal(r.state.conditions.HEALTH_UNAVAILABLE.active,true);
});
test('expected mailbox pause is quiet; unexpected pause or unexpected unpause alarms',()=>{
 let r=next(null,t0);r=next(r.state,t0+300000);assert.deepEqual(r.events,[]);
 r=next(null,t0,{}, {expectedMailboxPaused:false});r=next(r.state,t0+300000,{}, {expectedMailboxPaused:false});assert.ok(r.events.some(e=>e.code==='MAILBOX_UNEXPECTEDLY_PAUSED'));
 r=next(null,t0,{mailbox:{enabled:true,paused:false}});r=next(r.state,t0+300000,{mailbox:{enabled:true,paused:false}});assert.equal(r.events[0].code,'MAILBOX_EXPECTATION_MISMATCH');
});
test('memory must remain high for five minutes; a short spike stays quiet',()=>{
 const memory={currentBytes:90,limitBytes:100};let r=next(null,t0,{memory});r=next(r.state,t0+1000,{memory});assert.deepEqual(r.events,[]);
 r=next(r.state,t0+300000,{memory});assert.equal(r.events[0].code,'MEMORY_PRESSURE');
 let short=next(null,t0,{memory});short=next(short.state,t0+1000);assert.deepEqual(short.events,[]);
});
test('domain incidents are deduplicated and only fixed labels reach state or events',()=>{
 const findings=[{code:'MAIL_RECONCILIATION_REQUIRED',scope:'proof-mail',status:'uncertain',to:'secret@example.invalid',error:'TOKEN-DO-NOT-LOG'},{code:'DISK_SPACE_LOW'},{code:'FINANCE_RECONCILIATION_REQUIRED',status:'failed'}];
 let r=next(null,t0,{findings});r=next(r.state,t0+300000,{findings});assert.equal(r.events.length,3);
 assert.doesNotMatch(JSON.stringify(r),/secret@|TOKEN|to|error/);
 r=next(r.state,t0+600000,{findings});assert.deepEqual(r.events,[]);
});
test('late feed sync differs from expired price data, popularity is only a warning',()=>{
 const patch={feeds:{'pf-prices.json':{present:true,modifiedAgeSeconds:7300},'pf-stock.json':{present:true,modifiedAgeSeconds:60}},findings:[{code:'POPULARITY_STALE',scope:'pf-popularity.json',field:'updatedAt'}]};
 let r=next(null,t0,patch);r=next(r.state,t0+300000,patch);assert.ok(r.events.some(e=>e.code==='FEED_SYNC_LATE:pf-prices.json'));assert.ok(r.events.every(e=>e.severity==='warning'));assert.ok(!r.events.some(e=>e.code.startsWith('COMMERCE_FEED_STALE')));
});
test('unknown codes and tampered state cannot inject private strings into notifications',()=>{
 let r=next(null,t0,{findings:[{code:'secret@example.invalid'}]});r=next(r.state,t0+300000,{findings:[{code:'secret@example.invalid'}]});assert.equal(r.events[0].code,'MONITOR_INPUT_INVALID');assert.doesNotMatch(JSON.stringify(r),/secret@/);
 assert.throws(()=>next({version:1,lastObservedAt:new Date(t0).toISOString(),conditions:{'secret@example.invalid':{}}},t0+1),/Invalid monitor state/);
});
test('offline CLI persists counters atomically, never loads .env or sends a message',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-alert-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'snapshot.json'),state=join(dir,'state.json');await writeFile(input,JSON.stringify(sample(Date.now())));await writeFile(join(dir,'.env'),'THIS_FILE_MUST_NOT_BE_LOADED=1');
 const script=fileURLToPath(new URL('../scripts/preview-operations-alerts.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,[script,'--input',input,'--state',state],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stderr);assert.deepEqual(JSON.parse(first.stdout),{delivery:'disabled',events:[],duplicate:false});
 const original=await readFile(state,'utf8');const repeated=run();assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout).duplicate,true);assert.equal(await readFile(state,'utf8'),original);
 await writeFile(state,'broken');assert.notEqual(run().status,0);assert.equal(await readFile(state,'utf8'),'broken');
});


test('missing metrics never falsely recover memory or disk incidents',()=>{
 let r=next(null,t0,{memory:{currentBytes:90,limitBytes:100},disk:{totalBytes:10000000000,availableBytes:1}});
 r=next(r.state,t0+300000,{memory:{currentBytes:90,limitBytes:100},disk:{totalBytes:10000000000,availableBytes:1}});assert.equal(r.events.length,2);
 r=next(r.state,t0+600000,{memory:null,disk:null});r=next(r.state,t0+900000,{memory:null,disk:null});
 assert.equal(r.state.conditions.MEMORY_PRESSURE.active,true);assert.equal(r.state.conditions.DISK_SPACE_LOW.active,true);assert.equal(r.events[0].code,'METRICS_UNAVAILABLE');
});


test('a stale mailbox finding and derived stale check produce one incident',()=>{
 const patch={mailbox:{enabled:true,paused:false,lastCheckedAt:new Date(t0-600000).toISOString()},findings:[{code:'MAILBOX_CHECK_STALE',scope:'proof-mailbox'}]};
 let r=next(null,t0,patch,{expectedMailboxPaused:false});r=next(r.state,t0+300000,patch,{expectedMailboxPaused:false});assert.equal(r.events.length,1);assert.equal(r.events[0].code,'MAILBOX_CHECK_STALE:proof-mailbox');
});
