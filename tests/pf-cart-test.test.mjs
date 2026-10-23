import {readTestOrderMockup} from '../lib/pf-test-artwork.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sendCartTest} from '../lib/pf-cart-test.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {designGroupSize} from '../dist/design-layers.mjs';
import {readSignedArtwork} from '../lib/pf-artwork.mjs';
import {readOrder} from '../lib/pf-orders.mjs';

const p=await loadPFProduct('pf-120632'),v=p.variants[0],o=v.options[0],stamp=new Date().toISOString();
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n'),logo={id:randomUUID(),name:'test-logo.pdf',type:'application/pdf',size:bytes.length},art={id:randomUUID(),logo,x:.5,y:.5,scale:.24,rotation:0};
const textPlacement={x:.5,y:.5,scale:.24},size=designGroupSize([art],'',textPlacement,o);
const line={productId:p.id,sku:v.sku,quantity:25,decorations:[{optionId:o.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'',textPlacement,artworks:[art]}]};
const env={PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'test',PF_GATEWAY_TEST_PASSWORD:'test',PF_GATEWAY_SENDER_ID:'test',PF_COMMUNICATION_EMAIL:'test@example.dk',SMERCH_PUBLIC_BASE_URL:'https://example.dk',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32)};
const options={env,catalog:{products:[p]},prices:{productDate:stamp,printDate:stamp,products:{[v.sku]:{currency:'DKK',minimumDecoration:25,tiers:[{min:1,net:100}]}},prints:{[o.printCode]:{currency:'DKK',dependence:'None',ltm:0,combinations:[{area:0,colors:1,setups:1,setup:100,tiers:[{min:1,net:10}]}]}}},rules:{goodsMarkup:50,printMarkup:50},stock:{updatedAt:stamp,items:{[v.sku]:{available:100}}}};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input=()=>({requestId:randomUUID(),confirmation:'TEST',mockups:[{lineIndex:0,decorationIndex:0,base64:png}],lines:[structuredClone(line)],shipping:{name:'Testkunde',email:'test@example.dk',phone:'12345678',street:'Testvej 1, 2. th.',postalCode:'1000',city:'København'},colours:{'0:0':['Black C']},artworks:[{id:logo.id,base64:bytes.toString('base64')}]});

test('cart test sends signed original bytes, accurate contact and decoration without a payment; repeated requests send once',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-pf-test-'));process.env.SMERCH_DATA_DIR=root;
 try{
  const request=input();let calls=0,payload;
  const settings={...options,fetchImpl:async(url,init)=>{calls++;assert.match(url,/\/test\/RestGateway/);payload=JSON.parse(init.body);const download=await readSignedArtwork(new URL(payload.Artworks[0].UrlArtFile).searchParams,{env});assert.deepEqual(download.data,bytes);assert.deepEqual(payload.Artworks.map(a=>a.ArtworkType),['RAW','PROOF']);const visual=await readSignedArtwork(new URL(payload.Artworks[1].UrlArtFile).searchParams,{env});assert.equal(visual.mimeType,'image/png');assert.deepEqual(visual.data,Buffer.from(png,'base64'));return {ok:true,status:200,json:async()=>({status:'success',yourMessageId:payload.Header.messageId})};}};
  const [first,second]=await Promise.all([sendCartTest(request,settings),sendCartTest(request,settings)]);
  assert.equal(first.id,second.id);assert.equal((await sendCartTest(request,settings)).id,first.id);assert.equal(calls,1);
  assert.equal(payload.Header.isTest,true);assert.equal(payload.OrderType,'DECORATED');assert.equal(payload.SKUs[0].Eproof,'EPROOF');assert.equal(payload.SKUs[0].Quantity,25);assert.deepEqual(payload.Decorations[0].PMSColors,['Black C']);
  const contact=payload.Shipments[0].shipContact;assert.equal(contact.Attention,'Testkunde');assert.equal(contact.Email,'test@example.dk');assert.equal(contact.shipAddress.Address1,'Testvej 1, 2. th.');assert.equal(contact.shipAddress.PostalCode,'1000');
  assert.equal(first.checkoutId,null);assert.equal((await readOrder(first.id)).status,'gateway_accepted');assert.ok(!(await readdir(join(root,'checkouts'))).some(name=>name.endsWith('.json')));
  assert.deepEqual(await readTestOrderMockup(first,0,0),Buffer.from(png,'base64'));
  await assert.rejects(readTestOrderMockup({...first,id:'ord-wrong'},0,0),/matcher ikke ordren/);
  await assert.rejects(readTestOrderMockup(first,2,0),/findes ikke/);
  const query=new URL(payload.Artworks[0].UrlArtFile).searchParams;query.set('artwork','other');await assert.rejects(readSignedArtwork(query,{env}),/ugyldigt/);
 }finally{delete process.env.SMERCH_DATA_DIR;await rm(root,{recursive:true,force:true});}
});
test('cart test fails closed for live/off, missing files, colours, stock and invalid contacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-pf-test-'));process.env.SMERCH_DATA_DIR=root;let calls=0;const settings={...options,fetchImpl:async()=>{calls++;throw Error('must not send');}};
 try{
  await assert.rejects(sendCartTest({...input(),mockups:[]},settings),/Mockup mangler/);
  for(const mode of ['live','off'])await assert.rejects(sendCartTest(input(),{...settings,env:{...env,PF_GATEWAY_MODE:mode}}),/testmiljø/);
  await assert.rejects(sendCartTest({...input(),confirmation:'yes'},settings),/TEST/);
  await assert.rejects(sendCartTest({...input(),artworks:[]},settings),/logofiler/);
  await assert.rejects(sendCartTest({...input(),colours:{'0:0':['Black C','White']}},settings),/farvekoder/);
  await assert.rejects(sendCartTest({...input(),shipping:{...input().shipping,postalCode:'x'}},settings),/adresse/);
  await assert.rejects(sendCartTest(input(),{...settings,stock:{...options.stock,items:{[v.sku]:{available:0}}}}),/lager/);
  assert.equal(calls,0);
 }finally{delete process.env.SMERCH_DATA_DIR;await rm(root,{recursive:true,force:true});}
});
test('an uncertain PF response is recorded and never resubmitted on retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-pf-test-'));process.env.SMERCH_DATA_DIR=root;let calls=0;
 try{const request=input(),settings={...options,fetchImpl:async()=>{calls++;throw Error('timeout');}};await assert.rejects(sendCartTest(request,settings),/timeout/);assert.equal((await sendCartTest(request,settings)).status,'needs_reconciliation');assert.equal(calls,1);}
 finally{delete process.env.SMERCH_DATA_DIR;await rm(root,{recursive:true,force:true});}
});
