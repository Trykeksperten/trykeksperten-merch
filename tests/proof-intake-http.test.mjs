import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHmac} from 'node:crypto';
import {proofPdf} from './helpers/proof-pdf.mjs';
test('HTTP proof relay requires bearer and fresh signature, quarantines unknown orders and publishes once',async()=>{
 const root=await mkdtemp(join(tmpdir(),'proof-relay-http-')),id='ord-'+randomUUID(),pay='pay-'+randomUUID();
 for(const folder of ['orders','checkouts'])await mkdir(join(root,folder));
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify({id,checkoutId:pay,purchaseOrderNumber:'SMERCH-'+id.slice(4),pfOrderNumber:123,status:'awaiting_proof',shipping:{email:'customer@example.test'},lines:[],events:[]}));
 await writeFile(join(root,'checkouts',pay+'.json'),JSON.stringify({id:pay,status:'authorized',shipping:{email:'customer@example.test'},pfOrderIds:[id],lines:[]}));
 await writeFile(join(root,'automation-settings.json'),JSON.stringify({proofPublication:'automatic'}));
 const secret='local-test-relay-secret-no-production',token='local-test-inbox-token',child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,HOST:'127.0.0.1',PORT:'5209',SMERCH_DATA_DIR:root,PF_GATEWAY_MODE:'live',PF_PROOF_INBOX_TOKEN:token,PF_WEBHOOK_SIGNING_SECRET:secret},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',data=>stderr+=data);
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(stderr||'Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server timeout')),10000).unref())]);
  const input={messageId:'fixture-message',purchaseOrderNumber:'SMERCH-'+id.slice(4),pfOrderNumber:123,senderVerified:true,proofReference:'P1',mimeType:'application/pdf',contentBase64:(await proofPdf()).toString('base64')};
  const base='http://127.0.0.1:5209',post=(body=input,{auth=true,signed=true,timestamp=Math.floor(Date.now()/1000)}={})=>{const raw=JSON.stringify(body),headers={'content-type':'application/json'};if(auth)headers.authorization='Bearer '+token;if(signed){headers['x-smerch-timestamp']=String(timestamp);headers['x-smerch-signature']=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');}return fetch(base+'/api/pf-proof-inbox',{method:'POST',headers,body:raw});};
  assert.equal((await post(input,{auth:false})).status,401);
  assert.equal((await post(input,{signed:false})).status,400);
  assert.equal((await post(input,{timestamp:1})).status,400);
  const bad=await post({...input,messageId:'unknown',purchaseOrderNumber:'SMERCH-'+randomUUID()});assert.equal((await bad.json()).status,'blocked');
  assert.equal((await(await post()).json()).status,'published');
  assert.equal((await(await post()).json()).duplicate,true);
  assert.equal((await readdir(join(root,'proof-mail'))).filter(n=>n.endsWith('.json')).length,1);
  const order=JSON.parse(await readFile(join(root,'orders',id+'.json')));assert.equal(order.proofs.length,1);
  assert.equal((await fetch(base+'/api/pf-orders/'+id+'/proof-file?version=1')).status,401);
  assert.equal((await fetch(base+'/api/customer-proofs/'+id+'/file?token='+'f'.repeat(64))).status,400);
  assert.equal(JSON.parse(await readFile(join(root,'checkouts',pay+'.json'))).status,'authorized');
 }finally{if(child.exitCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}await rm(root,{recursive:true,force:true});}
});
