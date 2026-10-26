import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,scryptSync} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
test('finance HTTP requires staff and same origin, links shipment once, downloads basis and blocks unconfigured payments',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-finance-http-')),id='ord-'+randomUUID(),pay='pay-'+randomUUID();await mkdir(join(root,'orders'));await mkdir(join(root,'checkouts'));
 const order={id,checkoutId:pay,checkoutGroupIndex:0,status:'partially_shipped',createdAt:'2026-10-01',lines:[{sku:'DEMO',productName:'Demovare',quantity:3,decorations:[]}],shipping:{name:'Demo kunde',street:'Eksempelvej 1',city:'København S',postalCode:'2300',country:'DK',email:'test@example.com'},shipment:{deliveries:[{key:'demo-delivery',shipDate:'2026-10-01',items:[{sku:'DEMO',quantity:1}]}]},events:[]};
 const checkout={id:pay,createdAt:order.createdAt,status:'authorized',paymentProvider:'quickpay',lines:order.lines,legal:{customerType:'consumer'},quote:{net:10000,lines:[{net:10000}]},freightExVat:10,totalIncVat:12513,shipping:order.shipping,pfOrderIds:[id],fulfillment:{groups:[{lineIndexes:[0]}]},events:[]};
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify(order));await writeFile(join(root,'checkouts',pay+'.json'),JSON.stringify(checkout));
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const salt='11'.repeat(16),hash=scryptSync('test-password',Buffer.from(salt,'hex'),64).toString('hex'),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,SMERCH_PUBLIC_BASE_URL:base,SMERCH_CUSTOMER_BASE_URL:'https://shop.example.test',SMERCH_ADMIN_USERNAME:'test',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash,PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Timeout')),10000).unref())]);const url=base+'/api/pf-orders/'+id+'/finance';assert.equal((await fetch(url)).status,401);
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test',password:'test-password'})});assert.equal(login.status,200);const headers={cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json','x-smerch-admin':'1',origin:base};
 let view=await(await fetch(url,{headers})).json();assert.equal(view.shipments.length,1);assert.equal(view.summary.shipped,4170);assert.equal(view.summary.captured,0);assert.equal(view.shipments[0].invoiceStatus,'awaiting_accountant');view=await(await fetch(url,{headers})).json();assert.equal(view.shipments.length,1);
 const pdf=await fetch(url+'?basis='+encodeURIComponent(view.shipments[0].key),{headers});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');assert.equal((await fetch(url+'?basis='+encodeURIComponent(view.shipments[0].key))).status,401);
 const post=body=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://wrong.test'},body:'{}'})).status,401);assert.equal((await post({action:'payment',kind:'capture',amount:4170,key:'capture:http-test'})).status,400);
 const list=await(await fetch(base+'/api/admin/checkouts',{headers})).json();assert.ok(list.find(c=>c.id===pay).finance.problems.some(p=>p.includes('faktura')));
 assert.equal((await fetch(base+'/api/checkout/session',{method:'POST',headers,body:'{}'})).status,503);
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});}
});
