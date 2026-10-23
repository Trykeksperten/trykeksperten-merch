import test from 'node:test';
import assert from 'node:assert/strict';
import {pfColourCodes,pfColourPolicy} from '../lib/pf-colours.mjs';
import {buildPFOrder,submitPFOrder} from '../lib/pf-gateway.mjs';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';

test('Thomas: digital and colourless methods use canonical PMS values without a palette map',()=>{
 for(const [method,expected] of [['Digitaltryk','Full Color'],['Digital','Full Color'],['Gravering','Laser Engraving'],['Laser Engraving','Laser Engraving'],['Prægning','Debossing']]){
  assert.deepEqual(pfColourCodes({method,colors:4}),[expected]);
  const checkout={mockups:[{filename:'mockup-1-1.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}],id:'pay-123',lines:[{decorations:[{method,colors:4,artworks:[{logo:{id:'logo'}}]}]}]};
  const assets=pfAssetsForGroup(checkout,{lineIndexes:[0]},{env:{SMERCH_PUBLIC_BASE_URL:'https://smerch.example',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32)}});
  assert.deepEqual(assets['0:0'].pmsColors,[expected]);
 }
 assert.equal(pfColourPolicy({method:'Digital transfer'}).kind,'manual');
});
test('analog print requires explicit coated colours and rejects prohibited screen metallics',()=>{
 for(const method of ['Tampontryk','Serigrafi','Rundtryk','Transfer']){
  assert.throws(()=>pfColourCodes({method,colors:1}),/trykfarver/);
  assert.throws(()=>pfColourCodes({method,colors:1},['186 U']),/Solid Coated/);
  assert.throws(()=>pfColourCodes({method,colors:1},['#ffffff']),/Solid Coated/);
  assert.deepEqual(pfColourCodes({method,colors:2},['PANTONE 186 C','Black C']),['186 C','Black C']);
 }
 for(const method of ['Serigrafi','Rundtryk','Screenprint'])for(let n=871;n<=877;n++)assert.throws(()=>pfColourCodes({method,colors:1},[`${n}C`]),/metallic/);
 assert.deepEqual(pfColourCodes({method:'Tampontryk',colors:1},['871 C']),['871 C']);
});
const base={messageId:'message',createdAt:'2026-10-22',purchaseOrderNumber:'SMERCH-test',currency:'DKK',supplierTotal:10,shipping:{name:'Test',email:'customer@example.dk',phone:'12345678',address:{street:'Testvej 1',postalCode:'1000',city:'København',country:'DK'}},lines:[{sku:'sku',supplierUnitPrice:1,quantity:10,decorations:[]}]};
const settings={senderId:'SMERCH',communicationEmail:'proof@example.dk'};
const design={method:'Digitaltryk',methodCode:'15',positionCode:'front',colors:4,width:20,height:30,files:{raw:'https://smerch.example/art.pdf'}};
test('PF receives shipMail and digital artwork still requests EPROOF with unchanged amounts',()=>{
 const payload=buildPFOrder({...base,lines:[{...base.lines[0],decorations:[design]}]},settings);
 assert.equal(payload.Shipments[0].shipContact.shipMail,'customer@example.dk');
 assert.equal(payload.CommunicationEmail,'proof@example.dk');
 assert.equal(payload.SKUs[0].Eproof,'EPROOF');
 assert.equal(payload.SKUs[0].UnitPrice,1);
 assert.equal(payload.PurchaseOrderTotal,10);
 assert.deepEqual(payload.Decorations[0].PMSColors,['Full Color']);
 assert.equal(payload.Decorations[0].NumberOfColors,4);
 assert.throws(()=>buildPFOrder({...base,lines:[base.lines[0],{...base.lines[0],decorations:[design]}]},settings),/separate PF-ordrer/);
});
test('decorated live dispatch requires confirmed PF Store user before any network request',async()=>{
 const payload=buildPFOrder({...base,lines:[{...base.lines[0],decorations:[design]}]},{...settings,isTest:false});
 const env={PF_GATEWAY_MODE:'live',PF_GATEWAY_LIVE_ENABLED:'1',PF_GATEWAY_USERNAME:'u',PF_GATEWAY_PASSWORD:'p',PF_GATEWAY_SENDER_ID:'s',PF_COMMUNICATION_EMAIL:'proof@example.dk'};
 let sent=false;const fetchImpl=async()=>{sent=true;return {ok:true,status:200,json:async()=>({status:'success',yourMessageId:'message'})};};
 await assert.rejects(submitPFOrder(payload,{env,fetchImpl}),/aktiv bruger/);assert.equal(sent,false);
 await submitPFOrder(payload,{env:{...env,PF_COMMUNICATION_EMAIL_ACTIVE:'1'},fetchImpl});assert.equal(sent,true);
});
test('unconfirmed techniques do not inherit automatic RGB-to-Pantone mappings',()=>{
 const checkout={mockups:[{filename:'mockup-1-1.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}],id:'pay-123',lines:[{decorations:[{method:'Digital transfer',colors:1,text:'Test',ink:'#000000',artworks:[]}]}]};
 const env={SMERCH_PUBLIC_BASE_URL:'https://smerch.example',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32),SMERCH_PMS_COLOR_MAP:'{"#000000":"Black C"}'};
 assert.throws(()=>pfAssetsForGroup(checkout,{lineIndexes:[0]},{env}),/bekræftes manuelt/);
});
