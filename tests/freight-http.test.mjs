import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scryptSync} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {requestFreight,freightStatus} from '../lib/freight-quotes.mjs';
test('freight administration requires staff and same origin, records the real actor and creates no orders or mail',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-freight-http-'));process.env.SMERCH_DATA_DIR=root;
 const context={lines:[{sku:'123',quantity:25}],shipping:{name:'Test',email:'test@example.invalid'},goodsTotalIncVat:100000,deliveryMethod:'STD',groups:[{location:'PL',lineIndexes:[0]}]},ref=await requestFreight(context);
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const salt='11'.repeat(16),hash=scryptSync('test-password',Buffer.from(salt,'hex'),64).toString('hex'),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,SMERCH_PUBLIC_BASE_URL:base,SMERCH_ADMIN_USERNAME:'test',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash,PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Timeout')),10000).unref())]);const url=base+'/api/admin/freight-quotes';assert.equal((await fetch(url)).status,401);
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test',password:'test-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],headers={cookie,'content-type':'application/json','x-smerch-admin':'1',origin:base};
 const queue=await fetch(url,{headers});assert.match(queue.headers.get('cache-control'),/no-store/);const data=await queue.json();assert.equal(data.requests.length,1);assert.equal(data.requests[0].tokenHash,undefined);
 const input={currency:'DKK',exVatConfirmed:true,completeShipmentConfirmed:true,evidence:'Test PF quote',groups:[{location:'PL',supplierExVat:8000}],validUntil:new Date(Date.now()+3600000).toISOString(),actor:{type:'staff',name:'forged'}};
 assert.equal((await fetch(url+'/'+ref.id,{method:'POST',headers:{...headers,origin:'https://wrong.test'},body:JSON.stringify(input)})).status,401);
 assert.equal((await fetch(url+'/'+ref.id,{method:'POST',headers,body:JSON.stringify(input)})).status,200);
 const saved=(await(await fetch(url,{headers})).json()).requests[0];assert.equal(saved.quote.quotedBy.name,'test');assert.equal((await freightStatus(ref.id,ref.token,context)).freightIncVat,10000);
 assert.equal((await fetch(base+'/api/checkout/freight',{method:'POST',headers:{'content-type':'application/json',origin:'https://wrong.test'},body:'{}'})).status,403);
 assert.ok(!(await readdir(root)).some(name=>['orders','checkouts','order-mail','proof-mail'].includes(name)));
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});}
});
