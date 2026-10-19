import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {dataPath} from '../lib/data-path.mjs';
import {checkoutConfiguration,checkoutFulfillmentAssessment} from '../lib/checkout.mjs';
import {checkoutReadyForCapture} from '../lib/order-flow.mjs';
import {applyPFNotification} from '../lib/pf-orders.mjs';
const catalog={products:[{id:'p',variants:[{sku:'s',options:[{id:'front',productionLocation:'PL'}]}]}]},blank={productId:'p',sku:'s',quantity:1,decorations:[]},printed={...blank,decorations:[{optionId:'front'}]};
test('undecorated shipping requires separately confirmed country and freight',()=>{
 assert.equal(checkoutFulfillmentAssessment(catalog,[blank]).ready,false);
 assert.match(checkoutFulfillmentAssessment(catalog,[blank]).message,/uden tryk/);
 const options={blankShipping:{country:'NL',freightExVat:6000}};
 const result=checkoutFulfillmentAssessment(catalog,[blank],{},options);assert.equal(result.ready,true);
 assert.deepEqual(result.groups,[{location:'NL',kind:'blank',lineIndexes:[0]}]);
 assert.equal(checkoutFulfillmentAssessment(catalog,[blank],{PL:4000},{blankShipping:{country:'NL'}}).ready,false);
 assert.equal(checkoutFulfillmentAssessment(catalog,[printed],{PL:4000}).groups[0].location,'PL');
 assert.match(checkoutFulfillmentAssessment(catalog,[blank,printed],{PL:4000},options).message,/hver sin ordre/);
 const configured=checkoutConfiguration({SMERCH_BLANK_SHIPPING_COUNTRY:'nl',SMERCH_FREIGHT_BLANK_EX_VAT_DKK:'60'});
 assert.deepEqual(configured.blankShipping,{country:'NL',freightExVat:6000});
});
test('blank orders can be captured only after a real PF shipment notification',async()=>{
 const uuid=randomUUID(),id=`ord-${uuid}`,checkoutId=`pay-${randomUUID()}`,path=dataPath('orders',`${id}.json`);
 const checkout={id:checkoutId,lines:[blank],pfOrderIds:[id],fulfillment:{groups:[{location:'NL',kind:'blank',lineIndexes:[0]}]}};
 const order={id,checkoutId,purchaseOrderNumber:`SMERCH-${uuid}`,pfOrderNumber:1234,status:'confirmed',lines:[blank],events:[]};
 await mkdir(dataPath('orders'),{recursive:true});await writeFile(path,JSON.stringify(order));
 try{
  assert.equal(await checkoutReadyForCapture(checkout),false);
  const received=await applyPFNotification('shipment',{ShipmentNotification:{messageId:randomUUID(),deliveries:[{deliveryLocation:{customerPONumber:order.purchaseOrderNumber,carrier:'Test carrier',shipDate:new Date(Date.now()-60000).toISOString(),trackAndTrace:['https://example.invalid/tracking']}}]}});
  assert.equal(received.status,'shipped');assert.equal(await checkoutReadyForCapture(checkout),true);
  received.shipment.shipDate=new Date(Date.now()+86400000).toISOString();await writeFile(path,JSON.stringify(received));assert.equal(await checkoutReadyForCapture(checkout),false);
  received.shipment.shipDate=new Date(Date.now()-60000).toISOString();received.checkoutId='another-checkout';await writeFile(path,JSON.stringify(received));assert.equal(await checkoutReadyForCapture(checkout),false);
 }finally{await rm(path,{force:true});}
});

test('blank Quickpay capture is rejected before dispatch and runs once after confirmed dispatch',async()=>{
 const {persistCheckout}=await import('../lib/checkout.mjs'),{captureApprovedCheckout}=await import('../lib/order-flow.mjs');
 const uuid=randomUUID(),pfId=`ord-${uuid}`,id=`pay-${randomUUID()}`,pfPath=dataPath('orders',pfId+'.json'),checkoutPath=dataPath('checkouts',id+'.json');
 const env={PAYMENT_PROVIDER:'quickpay',QUICKPAY_API_KEY:'test-only',QUICKPAY_CAPTURE_ENABLED:'1'};
 const checkout={id,createdAt:new Date().toISOString(),status:'authorized',paymentProvider:'quickpay',lines:[blank],totalIncVat:10000,quickpayPaymentId:12345,quickpayOrderId:'TESTBLANK',authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),legal:{prepayment:false,personalised:false},pfOrderIds:[pfId],fulfillment:{groups:[{location:'NL',kind:'blank',lineIndexes:[0]}]},events:[]};
 const pf={id:pfId,checkoutId:id,purchaseOrderNumber:`SMERCH-${uuid}`,pfOrderNumber:321,status:'confirmed',lines:[blank],events:[]};
 await mkdir(dataPath('orders'),{recursive:true});await writeFile(pfPath,JSON.stringify(pf));await persistCheckout(checkout);let posts=0;
 const fetchImpl=async(url,options)=>{const payment={id:12345,order_id:'TESTBLANK',currency:'DKK',type:'Payment',accepted:true,link:{amount:10000},operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]};if(options.method==='POST'){posts++;payment.operations.push({id:2,type:'capture',amount:10000,pending:false,qp_status_code:'20000'});}return {ok:true,json:async()=>payment};};
 try{
  await assert.rejects(captureApprovedCheckout(id,{env,fetchImpl}),/ikke godkendt/);assert.equal(posts,0);
  await applyPFNotification('shipment',{ShipmentNotification:{messageId:randomUUID(),deliveries:[{deliveryLocation:{customerPONumber:pf.purchaseOrderNumber,shipDate:new Date(Date.now()-60000).toISOString()}}]}});
  assert.equal((await captureApprovedCheckout(id,{env,fetchImpl})).status,'paid');assert.equal(posts,1);
  assert.equal((await captureApprovedCheckout(id,{env,fetchImpl})).status,'paid');assert.equal(posts,1);
 }finally{await rm(pfPath,{force:true});await rm(checkoutPath,{force:true});}
});
