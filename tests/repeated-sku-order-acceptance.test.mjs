import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {designGroupSize} from '../dist/design-layers.mjs';
import {prepareCheckout,persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {prepareOrder,applyPFNotification,readOrder,recordProof,publishCustomerProof,decideProof,recordApprovalDelivery,recordExternalApproval} from '../lib/pf-orders.mjs';
import {quotePFCart} from '../lib/pf-pricing.mjs';
import {checkoutReadyForCapture,captureApprovedCheckout,validateRenewal} from '../lib/order-flow.mjs';
import {validatedPFDeliveries} from '../lib/pf-shipment.mjs';
import {reconcileSalesShipments,financeView,saveVerifiedPayment} from '../lib/sales-ledger.mjs';
import {executeSalesPayment} from '../lib/sales-payments.mjs';
import {salesBasis,salesBasisPDF} from '../lib/sales-basis.mjs';
import {companySettings,documentSeed,reviewDocument} from '../lib/order-documents.mjs';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {orderDetail} from '../lib/backoffice/operations.mjs';
import {documentDraft} from '../lib/backoffice/jobs.mjs';

// All source records live in a new temporary directory. The local option objects
// describe production-shaped records so the real accounting projection runs;
// no dispatch function, network fetch, SMTP transport or global PF flag is used.
const product=await loadPFProduct('pf-120632'),variant=product.variants[0],option=variant.options[0];
const actor={id:'system',companyId:'smerch',role:'administrator'};
const prepareEnv={PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'fixture-only',QUICKPAY_PRIVATE_KEY:'fixture-only',SMERCH_PUBLIC_BASE_URL:'https://example.test'};
const paymentEnv={QUICKPAY_MODE:'live',QUICKPAY_API_KEY:'fixture-only',QUICKPAY_CAPTURE_ENABLED:'1',SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1'};
const response=payment=>({ok:true,status:200,json:async()=>structuredClone(payment)});
const operation=(id,type,amount)=>({id,type,amount,pending:false,qp_status_code:'20000',created_at:new Date(Date.now()-3600000).toISOString()});
async function isolated(mode,fn){
 const previous={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED},root=await mkdtemp(join(tmpdir(),'repeated-sku-acceptance-'));
 process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;
 try{await fn();}finally{closeDatabases();for(const [key,value] of [['SMERCH_DATA_DIR',previous.root],['SMERCH_DATABASE_ENABLED',previous.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}
}
function design(text,quantity){
 const textPlacement={x:.5,y:.5,scale:.24},size=designGroupSize([],text,textPlacement,option);
 return {productId:product.id,sku:variant.sku,quantity,decorations:[{optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text,textPlacement}]};
}
async function fixture(){
 const stamp=new Date().toISOString(),catalog={products:[product]},prices={productDate:stamp,printDate:stamp,products:{[variant.sku]:{currency:'DKK',minimumDecoration:25,tiers:[{min:1,net:100.01},{min:50,net:60.03}]}},prints:{[option.printCode]:{currency:'DKK',dependence:'None',ltm:0,combinations:[{area:0,colors:1,setups:1,setup:100.03,tiers:[{min:1,net:10.01},{min:50,net:4.03}]}]}}},rules={goodsMarkup:50,printMarkup:50},stock={updatedAt:stamp,items:{[variant.sku]:{available:1000}}};
 const legal={customerType:'consumer'},input={lines:[design('DESIGN A',25),design('DESIGN B',50)],legal,shipping:{name:'Isoleret testkunde',email:'fixture@example.test',phone:'12345678',street:'Testvej 1',postalCode:'1000',city:'København',country:'DK'}};
 const order=prepareCheckout(input,{catalog,prices,rules,stock,env:prepareEnv});
 assert.equal(order.fulfillment.groups.length,1);assert.deepEqual(order.fulfillment.groups[0].lineIndexes,[0,1]);
 assert.equal(order.freightGroups.length,1);assert.equal(order.freightExVat,12000);assert.equal(order.freightIncVat,15000);
 assert.deepEqual(order.quote,quotePFCart(catalog,order.lines,prices,rules));
 assert.notEqual(order.quote.lines[0].net/order.lines[0].quantity,order.quote.lines[1].net/order.lines[1].quantity);
 assert.equal(order.totalIncVat,order.quote.totalIncVat+15000);
 assert.equal(validateRenewal(order,{catalog,prices,rules,stock,env:prepareEnv}),true);
 const commercial=structuredClone({lines:order.lines,quote:order.quote,fulfillment:order.fulfillment,freightGroups:order.freightGroups,freightQuote:order.freightQuote,freightExVat:order.freightExVat,freightIncVat:order.freightIncVat,totalIncVat:order.totalIncVat});
 // The HTTP checkout boundary adds accepted legal terms and provider evidence.
 Object.assign(order,{legal,paymentMode:'live',status:'authorized',authorizationExpiresAt:new Date(Date.now()+86400000).toISOString(),quickpayPaymentId:123,quickpayOrderId:randomUUID().replaceAll('-','').slice(0,20)});
 await persistCheckout(order);
 const group=order.fulfillment.groups[0],pf=await prepareOrder({checkoutId:order.id,checkoutGroupIndex:0,productionLocation:group.location,lines:order.lines,shipping:{...order.shipping,address:order.shipping},assets:{'0:0':{pmsColors:['Black C'],files:{raw:'https://example.test/design-a.txt'}},'1:0':{pmsColors:['Black C'],files:{raw:'https://example.test/design-b.txt'}}}},{catalog,prices,rules,stock,env:{PF_GATEWAY_MODE:'live',PF_GATEWAY_SENDER_ID:'FIXTURE',PF_COMMUNICATION_EMAIL:'proof@example.test'}});
 await updateCheckout(order.id,current=>{current.pfOrderIds=[pf.id];return current;});
 assert.equal(pf.gatewayPayload.SKUs.length,2);
 assert.deepEqual(pf.gatewayPayload.SKUs.map(l=>[l.skuReferenceID,l.SKUID,l.Quantity]),[['0',variant.sku,25],['1',variant.sku,50]]);
 assert.deepEqual(pf.gatewayPayload.SKUs.map(l=>l.UnitPrice),[100.01,60.03]);
 assert.deepEqual(pf.gatewayPayload.SKUs.map(l=>l.DecorationReferenceIDs),[['0'],['1']]);
 assert.deepEqual(pf.gatewayPayload.Decorations.map(d=>d.decoText),['DESIGN A','DESIGN B']);
 assert.deepEqual(pf.gatewayPayload.Artworks.map(a=>a.UrlArtFile),['https://example.test/design-a.txt','https://example.test/design-b.txt']);
 // 25*(100.01+10.01) + 50*(60.03+4.03) + 2*100.03 setup;
 // neither combine quantity tiers nor duplicate freight on the two designs.
 assert.equal(pf.supplierTotal,6153.56);assert.equal(pf.gatewayPayload.PurchaseOrderTotal,6153.56);
 await applyPFNotification('confirmation',{messageId:randomUUID(),reference:pf.purchaseOrderNumber,orderNumber:'FIXTURE-PF-123'});
 const pdf=await PDFDocument.create();pdf.addPage();
 await recordProof(pf.id,{proofReference:'Both designs approved together',contentBase64:Buffer.from(await pdf.save()).toString('base64'),mimeType:'application/pdf'});
 const access=await publishCustomerProof(pf.id,{version:1},{env:{SMERCH_CUSTOMER_BASE_URL:'https://example.test'}}),token=new URLSearchParams(access.url.hash.slice(1)).get('token');
 await decideProof(pf.id,{version:1,decision:'approve',customerToken:token});
 await recordApprovalDelivery(pf.id,{channel:'PF Store',reference:'isolated-approval'});
 await recordExternalApproval(pf.id,{pfApprovalReference:'isolated-pf-ack'});
 const payment={id:123,order_id:order.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:false,acquirer:'clearhaus',accepted:true,link:{amount:order.totalIncVat},operations:[operation(1,'authorize',order.totalIncVat)]};let posts=0;
 const fetchImpl=async(url,options)=>{assert.match(url,/^https:\/\/api\.quickpay\.net\/payments\/123(?:\/capture)?$/);if(options.method==='POST'){posts++;assert.equal(posts,1);assert.equal(JSON.parse(options.body).amount,order.totalIncVat);payment.operations.push(operation(2,'capture',order.totalIncVat));}else assert.equal(options.method,'GET');return response(payment);};
 return {order,pf,commercial,payment,fetchImpl,posts:()=>posts};
}
function notification(pf,quantity,{reference='parcel-1',complete=false,date=new Date(Date.now()-600000).toISOString()}={}){
 return {ShipmentNotification:{messageId:randomUUID(),deliveries:[{deliveryLocation:{customerPONumber:pf.purchaseOrderNumber,reference:{shipmentID:reference},carrier:'UPS',shipDate:date,isOrderComplete:complete,item:[{SKU:variant.sku,quantity}],trackAndTrace:[{trackingId:reference,trackingURL:'https://example.test/tracking/'+reference}]}}]}};
}
const commercialOf=order=>Object.fromEntries(['lines','quote','fulfillment','freightGroups','freightQuote','freightExVat','freightIncVat','totalIncVat'].map(key=>[key,order[key]]));

for(const mode of ['0','1'])for(const flow of ['finance','legacy'])test(`two same-SKU designs: actual checkout to exact aggregate delivery, one ${flow} capture and documents (${mode==='1'?'SQLite':'JSON'})`,()=>isolated(mode,async()=>{
 const f=await fixture(),company=await companySettings();
 const capture=()=>flow==='finance'?executeSalesPayment(f.order.id,{kind:'capture',amount:f.order.totalIncVat,key:'same-sku-capture:'+f.order.id},{env:paymentEnv,fetchImpl:f.fetchImpl}):captureApprovedCheckout(f.order.id,{env:paymentEnv,fetchImpl:f.fetchImpl});
 const partial=notification(f.pf,25);await applyPFNotification('shipment',partial);
 let pf=await readOrder(f.pf.id),ledger=await reconcileSalesShipments(f.order.id);
 assert.equal(pf.status,'partially_shipped');assert.equal(validatedPFDeliveries(pf,await readCheckout(f.order.id)).deliveries.length,0);
 assert.equal(ledger.shipments.length,0,'25 units cannot be assigned to either differently priced design');
 assert.equal(await checkoutReadyForCapture(await readCheckout(f.order.id)),false);
 await assert.rejects(capture());assert.equal(f.posts(),0);
 const partialCheckout=await readCheckout(f.order.id);assert.throws(()=>documentSeed(pf,partialCheckout,company,'shipment'),/antal|afstem|SKU|lever/i);
 if(mode==='1'){
  const detail=orderDetail(actor,f.order.id);assert.deepEqual(detail.lines.map(l=>l.shipped),[0,0]);assert.equal(detail.delivery_status,'unshipped');
  await assert.rejects(documentDraft(actor,f.order.id,'shipment'),/antal|afstem/i);
 }
 // All quantities alone are insufficient: the supplier must explicitly mark
 // the order complete. The second callback is a second physical parcel.
 const final=notification(f.pf,50,{reference:'parcel-2'});await applyPFNotification('shipment',final);
 assert.equal((await reconcileSalesShipments(f.order.id)).shipments.length,0);
 assert.equal(await checkoutReadyForCapture(await readCheckout(f.order.id)),false);await assert.rejects(capture());assert.equal(f.posts(),0);
 final.ShipmentNotification.messageId=randomUUID();final.ShipmentNotification.deliveries[0].deliveryLocation.isOrderComplete=true;
 await applyPFNotification('shipment',final);await applyPFNotification('shipment',final);
 pf=await readOrder(f.pf.id);const checkout=await readCheckout(f.order.id),validated=validatedPFDeliveries(pf,checkout);
 assert.equal(pf.status,'shipped');assert.equal(pf.shipment.deliveries.length,2,'retain both actual parcel records');
 assert.deepEqual(validated.problems,[]);assert.equal(validated.deliveries.length,1,'one accounting aggregate, no invented design-to-parcel mapping');
 assert.equal(validated.deliveries[0].allocationScope,'supplier_order_complete');
 assert.deepEqual(validated.deliveries[0].sourceDeliveryKeys,pf.shipment.deliveries.map(d=>d.key).sort());
 assert.deepEqual(validated.deliveries[0].items,[{index:0,quantity:25},{index:1,quantity:50}]);
 assert.equal(await checkoutReadyForCapture(checkout),true);
 ledger=await reconcileSalesShipments(f.order.id);assert.deepEqual(ledger.problems,[]);assert.equal(ledger.shipments.length,1);
 const allocated=ledger.shipments[0];assert.deepEqual(allocated.lines.map(l=>[l.index,l.quantity,l.net,l.vat]),checkout.lines.map((l,i)=>[i,l.quantity,checkout.quote.lines[i].net,checkout.quote.lines[i].vat]));
 assert.equal(allocated.allocationScope,'supplier_order_complete');assert.deepEqual(allocated.sourceDeliveryKeys,validated.deliveries[0].sourceDeliveryKeys);
 assert.equal(allocated.freight,checkout.freightExVat);assert.equal(allocated.total,checkout.totalIncVat);
 const result=await capture();assert.equal(result.status,flow==='finance'?'confirmed':'paid');assert.equal(f.posts(),1);
 await capture();assert.equal(f.posts(),1);
 if(flow==='legacy')await saveVerifiedPayment(await readCheckout(f.order.id),f.payment);
 // Reload/retry and tracking-only enrichment retain the single monetary basis.
 closeDatabases();final.ShipmentNotification.deliveries[0].deliveryLocation.trackAndTrace[0].trackingURL='https://example.test/tracking/parcel-2-updated';
 await applyPFNotification('shipment',{ShipmentNotification:{...final.ShipmentNotification,messageId:randomUUID()}});await reconcileSalesShipments(f.order.id);
 const paid=await readCheckout(f.order.id),view=await financeView(f.order.id);
 assert.equal(paid.status,'paid');assert.equal(view.shipments.length,1);assert.equal(view.summary.captured,paid.totalIncVat);assert.equal(view.summary.shipped,paid.totalIncVat);
 assert.deepEqual(commercialOf(paid),f.commercial,'accepted merchandise prices, line identity and freight are immutable');
 const basis=salesBasis(paid,view.shipments[0],view);assert.deepEqual(basis.lines.map(l=>[l.quantity,l.net,l.vat]),paid.lines.map((l,i)=>[l.quantity,paid.quote.lines[i].net,paid.quote.lines[i].vat]));
 assert.equal(basis.total,paid.totalIncVat);assert.equal(basis.freight,12000);assert.ok((await PDFDocument.load(await salesBasisPDF(paid,view.shipments[0],view))).getPageCount()>0);
 pf=await readOrder(f.pf.id);const shipmentDoc=documentSeed(pf,paid,company,'shipment');assert.deepEqual(shipmentDoc.lines.map(l=>l.quantity),[25,50]);assert.deepEqual(reviewDocument(pf,paid,company,shipmentDoc).missing,[]);
 assert.equal(shipmentDoc.shipmentAllocationScope,'supplier_order_complete');assert.deepEqual(shipmentDoc.sourceDeliveryKeys,allocated.sourceDeliveryKeys);assert.match(shipmentDoc.shipmentScopeDescription,/hele ordren/);
 assert.throws(()=>documentSeed(pf,paid,company,'shipment',pf.shipment.deliveries[0].key),/fordeles|samlede/i);
 const receipt=documentSeed(pf,paid,company,'receipt');assert.deepEqual(receipt.lines.map(l=>[l.quantity,l.net]),paid.lines.map((l,i)=>[l.quantity,paid.quote.lines[i].net]));assert.deepEqual(reviewDocument(pf,paid,company,receipt).missing,[]);
 if(mode==='1'){
  const detail=orderDetail(actor,f.order.id);assert.deepEqual(detail.lines.map(l=>l.shipped),[25,50]);assert.equal(detail.delivery_status,'shipped');assert.equal(detail.payment_status,'paid');assert.equal(detail.shipments.length,1);
  const draft=await documentDraft(actor,f.order.id,'shipment');assert.deepEqual(draft.lines.map(l=>l.quantity),[25,50]);assert.equal(draft.shipmentAllocationScope,'supplier_order_complete');assert.deepEqual(draft.sourceDeliveryKeys,allocated.sourceDeliveryKeys);assert.deepEqual(db().pragma('foreign_key_check'),[]);
 }
}));
