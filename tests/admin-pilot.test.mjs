import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertAdminPilot,prepareAdminPilot} from '../lib/admin-checkout-test.mjs';
import {persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {createQuickpayLink,applyQuickpayCallback} from '../lib/quickpay.mjs';
const root=await mkdtemp(join(tmpdir(),'smerch-pilot-'));process.env.SMERCH_DATA_DIR=root;
after(()=>rm(root,{recursive:true,force:true}));
const env={SMERCH_ADMIN_PILOT_ENABLED:'1',SMERCH_ADMIN_PILOT_MAX_DKK:'500',PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'live',QUICKPAY_LIVE_ENABLED:'1',QUICKPAY_CAPTURE_ENABLED:'1',PF_GATEWAY_MODE:'live',PF_GATEWAY_LIVE_ENABLED:'1',PF_AUTO_SUBMIT_ENABLED:'1',PF_COMMUNICATION_EMAIL_ACTIVE:'1',PF_COMMUNICATION_EMAIL:'korrektur@smerch.dk',PF_WHITE_LABEL_CONFIRMED:'1',PF_PROOF_DELIVERY_CONFIRMED:'1',QUICKPAY_AUTH_HOLD_HOURS:'24',QUICKPAY_API_KEY:'fixture',QUICKPAY_PRIVATE_KEY:'fixture',SMERCH_PUBLIC_BASE_URL:'https://shop.example',SMERCH_FREIGHT_EX_VAT_DKK:'150'};
const fixture=()=>({id:'pay-'+randomUUID(),status:'prepared',paymentProvider:'quickpay',totalIncVat:25000,lines:[{decorations:[{artworks:[{logo:{id:'fixture'}}]}]}],shipping:{email:'test@example.invalid'},events:[],createdAt:new Date().toISOString()});
test('real pilot requires login and explicit activation, approved live setup and a bounded amount',()=>{
 assert.doesNotThrow(()=>assertAdminPilot(true,env));assert.throws(()=>assertAdminPilot(false,env));
 for(const key of Object.keys(env).filter(k=>env[k]==='1'))assert.throws(()=>assertAdminPilot(true,{...env,[key]:'0'}),key);
 for(const value of [undefined,'0','NaN','Infinity'])assert.throws(()=>assertAdminPilot(true,{...env,SMERCH_ADMIN_PILOT_MAX_DKK:value}));
 assert.throws(()=>prepareAdminPilot({...fixture(),totalIncVat:50001},env),/beløbsgrænse/);
 assert.throws(()=>prepareAdminPilot({...fixture(),lines:[{decorations:[]}]},env),/logo/);
 assert.throws(()=>assertAdminPilot(true,{...env,QUICKPAY_MODE:'test'}));
});
test('pilot uses full-price credit card reservation, rejects sandbox callbacks and keeps real-order semantics',async()=>{
 const order=prepareAdminPilot(fixture(),env);assert.equal(order.adminPilot,true);assert.equal(order.adminTest,false);assert.equal(order.totalIncVat,25000);
 await persistCheckout(order);let link;
 await createQuickpayLink(order.id,{env,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);if(options.method==='POST')return {ok:true,json:async()=>({id:1234,order_id:body.order_id})};link=body;return {ok:true,json:async()=>({url:'https://payment.quickpay.net/payments/fixture'})};}});
 assert.equal(link.amount,25000);assert.equal(link.payment_methods,'mobilepay,apple-pay,google-pay,creditcard');assert.equal(link.auto_capture,false);
 const saved=await readCheckout(order.id),payment={id:1234,order_id:saved.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:false,accepted:true,link:{amount:25000},operations:[{id:1,type:'authorize',amount:25000,pending:false,qp_status_code:'20000'}]};
 await assert.rejects(applyQuickpayCallback({...payment,test_mode:true},{env}),/test\/live/);
 await applyQuickpayCallback(payment,{env});const authorized=await readCheckout(order.id);assert.equal(authorized.status,'authorized');assert.equal(authorized.paymentMode,'live');assert.equal(authorized.adminTest,false);
});
test('HTTP keeps public checkout closed and refuses unauthenticated pilot even with live flags',async()=>{
 const {spawn}=await import('node:child_process'),{once}=await import('node:events'),{fileURLToPath}=await import('node:url');
 const {createServer}=await import('node:net');const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,...env},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited: '+errors);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
  const base=`http://127.0.0.1:${port}`,post=path=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json','x-smerch-admin':'1'},body:'{}'});
  assert.equal((await post('/api/checkout/session')).status,503);
  assert.equal((await post('/api/admin/checkout-pilot/session')).status,403);
  assert.equal((await fetch(base+'/api/admin/checkout-pilot/status')).status,403);
  const preview='/api/admin/checkouts/pay-'+randomUUID()+'/mockups';assert.equal((await fetch(base+preview)).status,403);assert.equal((await post(preview)).status,403);
  assert.equal((await post('/api/admin/checkout-pilot/pay-'+randomUUID()+'/reauthorize')).status,403);
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
});
test('PF freight quote is restricted to the approved ten-cap embroidery pilot',async()=>{
 const {pilotFreightExVat}=await import('../lib/pilot-freight.mjs');
 const line={productId:'pf-38687',sku:'38687070',quantity:10,decorations:[{optionId:'printdata_cse1_dk_label_v3:8182',width:85,height:25,colors:1}]};
 assert.equal(pilotFreightExVat([line]),6500);
 for(const change of [{quantity:11},{sku:'38687550'},{decorations:[]}])assert.equal(pilotFreightExVat([{...line,...change}]),null);
 assert.equal(pilotFreightExVat([line,line]),null);
 assert.equal(26000+35190+32000+6500+Math.round((26000+35190+32000+6500)*.25),124613);
});
test('approved cap pilot totals 1246.13 including PF freight and VAT without changing public freight',async()=>{
 const {loadPFProduct}=await import('../lib/pf-catalog-store.mjs'),{prepareCheckout}=await import('../lib/checkout.mjs');
 const p=await loadPFProduct('pf-38687'),stamp=new Date().toISOString();
 const prices={productDate:stamp,printDate:stamp,products:{'38687070':{currency:'DKK',minimumDecoration:50,tiers:[{min:1,net:26}]}},prints:{EMBF02:{currency:'DKK',dependence:'None',ltm:0,combinations:[{area:0,colors:1,setups:1,setup:320,tiers:[{min:1,net:35.19}]}]}}};
 const line={productId:p.id,sku:'38687070',quantity:10,decorations:[{optionId:'printdata_cse1_dk_label_v3:8182',width:85,height:25,colors:1,text:'',textPlacement:{x:.5,y:.5,scale:.24},artworks:[{id:'layer',x:.5,y:.5,scale:.85,rotation:0,logo:{id:'logo',name:'fixture.ai',type:'application/illustrator',size:100,pixelWidth:340,pixelHeight:100,detectedColors:1}}]}]};
 const input={lines:[line],shipping:{name:'Test',email:'test@example.invalid',phone:'12345678',street:'Testvej 1',postalCode:'1000',city:'København',country:'DK'}},options={catalog:{products:[p]},prices,rules:{goodsMarkup:100,printMarkup:100},stock:{updatedAt:stamp,items:{'38687070':{available:100}}},env};
 const pilot=prepareCheckout(input,{...options,atSupplierCost:true});assert.equal(pilot.freightExVat,6500);assert.equal(pilot.totalIncVat,124613);
 const publicOrder=prepareCheckout({...input,atSupplierCost:true},options);assert.equal(publicOrder.freightExVat,15000);assert.notEqual(publicOrder.totalIncVat,124613);
});
