import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {companySettings,documentSeed,reviewDocument,createOrderDocument,readOrderDocument} from '../lib/order-documents.mjs';
import {shipmentProblems} from '../lib/pf-shipment.mjs';
import {reconcileShipmentMail,shipmentMailStatus,sendShipmentMail,shipmentProductName} from '../lib/shipment-mail.mjs';
import {salesBasis,salesBasisPDF} from '../lib/sales-basis.mjs';
import {reconcileSalesShipments} from '../lib/sales-ledger.mjs';
import {saveRecord} from '../lib/backoffice/records.mjs';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {documentDraft,checkedDocument,runJobs} from '../lib/backoffice/jobs.mjs';
import {saveCustomer,saveQuote,quoteTransition,orderDetail,addShipment} from '../lib/backoffice/operations.mjs';

const actor={id:'system',companyId:'smerch',role:'administrator'};
async function isolated(mode,fn){const root=await mkdtemp('/tmp/smerch-repeated-document-'),before={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED};process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;try{await fn(root);}finally{closeDatabases();for(const [key,value] of [['SMERCH_DATA_DIR',before.root],['SMERCH_DATABASE_ENABLED',before.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}}
function fixture(){
 const checkout={id:'pay-'+randomUUID(),status:'authorized',createdAt:'2026-01-01T12:00:00Z',paymentProvider:'quickpay',quickpayPaymentId:123,quickpayOrderId:'synthetic',lines:[{sku:'SAME',productId:'same',productName:'Design A',quantity:25,decorations:[{optionId:'front',text:'A'}]},{sku:'SAME',productId:'same',productName:'Design B',quantity:50,decorations:[{optionId:'front',text:'B'}]}],quote:{currency:'DKK',net:50000,vat:12500,totalIncVat:62500,lines:[{net:20000,vat:5000},{net:30000,vat:7500}]},freightExVat:1000,freightIncVat:1250,totalIncVat:63750,shipping:{name:'Syntetisk kunde',email:'fixture@example.test',street:'Testvej 1',postalCode:'1000',city:'Test',country:'DK'},legal:{customerType:'business'},fulfillment:{groups:[{location:'NL',lineIndexes:[0,1]}]}};
 const delivery=(key,quantity,complete=false)=>({key,shipDate:'2026-01-02T12:00:00Z',carrier:'Demo',isOrderComplete:complete,items:[{sku:'SAME',quantity}],trackingDetails:[{trackingId:key,trackingURL:'https://example.test/'+key}]});
 const pf={id:'ord-'+randomUUID(),pfOrderNumber:'SYNTHETIC-123',purchaseOrderNumber:'SYNTHETIC-PO',checkoutId:checkout.id,checkoutGroupIndex:0,productionLocation:'NL',createdAt:checkout.createdAt,status:'shipped',lines:structuredClone(checkout.lines),shipping:checkout.shipping,shipment:{isOrderComplete:true,issues:[],deliveries:[delivery('parcel-a',30),delivery('parcel-b',45,true)]},events:[]};checkout.pfOrderIds=[pf.id];return {checkout,pf,delivery};
}
async function persist(root,checkout,pf){for(const [namespace,value] of [['checkouts',checkout],['orders',pf]])if(process.env.SMERCH_DATABASE_ENABLED==='1')saveRecord(namespace,value.id,value);else{await mkdir(join(root,namespace),{recursive:true});await writeFile(join(root,namespace,value.id+'.json'),JSON.stringify(value));}}
async function pdfText(bytes){const task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;try{const text=[];for(let i=1;i<=pdf.numPages;i++)text.push((await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));return text.join(' ');}finally{await task.destroy();}}

for(const mode of ['0','1'])test(`repeated-SKU complete PDF keeps original design quantities, complete-order scope and all parcel evidence (${mode})`,()=>isolated(mode,async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);const company=await companySettings(),seed=documentSeed(pf,checkout,company,'shipment');
 assert.deepEqual(seed.lines.map(l=>l.quantity),[25,50]);assert.deepEqual(seed.lines.map(l=>l.description),['Design A','Design B']);assert.equal(seed.shipmentKey,'order-complete-v1');assert.equal(seed.shipmentAllocationScope,'supplier_order_complete');assert.deepEqual(seed.sourceDeliveryKeys,['parcel-a','parcel-b']);assert.match(seed.tracking,/parcel-a/);assert.match(seed.tracking,/parcel-b/);
 assert.throws(()=>documentSeed(pf,checkout,company,'shipment','parcel-a'),/samlede forsendelsesbekræftelse/);
 const edited={...seed,shipmentAllocationScope:'parcel',shipmentScopeDescription:'Only parcel A',sourceDeliveryKeys:['fabricated'],notes:''};const reviewed=reviewDocument(pf,checkout,company,edited);assert.equal(reviewed.shipmentScopeDescription,seed.shipmentScopeDescription);assert.deepEqual(reviewed.sourceDeliveryKeys,seed.sourceDeliveryKeys);assert.deepEqual(reviewed.missing,[]);
 assert.throws(()=>reviewDocument(pf,checkout,company,{...seed,lines:seed.lines.map(l=>({...l,quantity:1}))}),/komplette PF-ordres antal/);
 const generated=await createOrderDocument(pf,checkout,company,{...edited,requestId:randomUUID()});if(generated.pending)await runJobs();const stored=await readOrderDocument(pf.id,generated.id),bytes=Buffer.from(stored.pdf,'base64');assert.match(await pdfText(bytes),/Samlet bekræftelse for den komplette PF-ordre/);assert.deepEqual(stored.document.sourceDeliveryKeys,['parcel-a','parcel-b']);
 if(mode==='1'){const draft=await documentDraft(actor,checkout.id,'shipment');assert.deepEqual(draft.lines.map(l=>l.quantity),[25,50]);assert.deepEqual(draft.sourceDeliveryKeys,seed.sourceDeliveryKeys);assert.match(draft.tracking,/parcel-a/);assert.match(draft.tracking,/parcel-b/);assert.deepEqual((await checkedDocument(actor,checkout.id,draft)).missing,[]);
  db().prepare('UPDATE shipment_lines SET quantity=quantity-1 WHERE order_line_id=?').run(checkout.id+':0');await assert.rejects(documentDraft(actor,checkout.id,'shipment'),/antal kræver afstemning/);
 }
 if(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR&&mode==='0'){await mkdir(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR,{recursive:true});await writeFile(join(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR,'repeated-sku-shipment.pdf'),bytes);}
}));

test('repeated-SKU partial, missing original source, wrong design and sticky cancellation cannot make a document; standalone uses same exact-completion rules',()=>isolated('0',async()=>{
 const {checkout,pf}=fixture(),company=await companySettings(),partial=structuredClone(pf);partial.status='partially_shipped';partial.shipment.deliveries.pop();partial.shipment.isOrderComplete=false;
 assert.throws(()=>documentSeed(partial,checkout,company,'shipment'),/komplet PF-ordre/);assert.throws(()=>documentSeed(pf,null,company,'shipment'),/Kundeordren mangler/);
 const changed=structuredClone(checkout);changed.lines[0].decorations[0].text='different';assert.throws(()=>documentSeed(pf,changed,company,'shipment'),/designlinjer matcher ikke/);
 assert.throws(()=>documentSeed({...pf,pfCancellation:{receivedAt:'2026-01-03'}},checkout,company,'shipment'),/afklaring/);
 delete pf.checkoutId;assert.deepEqual(documentSeed(pf,null,company,'shipment').lines.map(l=>l.quantity),[25,50]);delete partial.checkoutId;assert.throws(()=>documentSeed(partial,null,company,'shipment'),/komplet PF-ordre/);
}));

for(const mode of ['0','1'])test(`parcel mail accepts actual combined SKU quantities without assigning a design, sends once through injected transport (${mode})`,()=>isolated(mode,async root=>{
 const {checkout,pf,delivery}=fixture();pf.shipment.deliveries=[delivery('one-parcel',75,true)];await persist(root,checkout,pf);const parcel=pf.shipment.deliveries[0];assert.deepEqual(shipmentProblems(pf,parcel),[]);assert.equal(shipmentProductName(pf,checkout,'SAME'),'SAME');
 await reconcileShipmentMail(pf);const [record]=await shipmentMailStatus(pf.id);assert.equal(record.status,'review');assert.match(record.text,/75 × SAME/);assert.doesNotMatch(record.text,/Design A|Design B/);let sends=0;const transport={sendMail:async mail=>{sends++;assert.match(mail.text,/75 × SAME/);return {accepted:[mail.to]};}};
 await sendShipmentMail(pf.id,record.id,{transport,env:{}});await sendShipmentMail(pf.id,record.id,{transport,env:{}});assert.equal(sends,1);
 assert.equal(shipmentProductName(pf,{...checkout,productNames:{same:'Common cap'}},'SAME'),'Common cap');
 const over={...parcel,items:[{sku:'SAME',quantity:40},{sku:'SAME',quantity:40}]};assert.ok(shipmentProblems(pf,over).some(p=>p.includes('afstemmes')));
 assert.ok(shipmentProblems({...pf,pfCancellation:{}},parcel).some(p=>p.includes('afklaring')));
}));

test('split rows of one parcel are added by SKU and partial parcel mail never claims a design allocation',()=>isolated('0',async root=>{
 const {checkout,pf,delivery}=fixture();pf.status='partially_shipped';pf.shipment.isOrderComplete=false;pf.shipment.deliveries=[{...delivery('partial-parcel',30),items:[{sku:'SAME',quantity:10},{sku:'SAME',quantity:20}]}];await persist(root,checkout,pf);await reconcileShipmentMail(pf);const [record]=await shipmentMailStatus(pf.id);assert.equal(record.status,'review');assert.match(record.subject,/En del/);assert.match(record.text,/30 × SAME/);assert.equal((record.text.match(/× SAME/g)||[]).length,1);assert.doesNotMatch(record.text,/Design A|Design B/);
}));

test('financial aggregate basis states whole supplier-order scope and keeps original differently priced lines',()=>isolated('0',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);const ledger=await reconcileSalesShipments(checkout.id),shipment=ledger.shipments[0];assert.equal(shipment.allocationScope,'supplier_order_complete');const basis=salesBasis(checkout,shipment,ledger);assert.deepEqual(basis.lines.map(l=>[l.quantity,l.net,l.vat]),[[25,20000,5000],[50,30000,7500]]);assert.equal(basis.total,checkout.totalIncVat);assert.deepEqual(basis.sourceDeliveryKeys,['parcel-a','parcel-b']);assert.match(basis.shipmentScopeDescription,/komplette PF-ordre/);assert.match(basis.notes,/Pakkereferencer: parcel-a, parcel-b/);
 const bytes=await salesBasisPDF(checkout,shipment,ledger);assert.match(await pdfText(bytes),/Samlet fakturagrundlag for den komplette PF-ordre/);
 if(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR){await mkdir(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR,{recursive:true});await writeFile(join(process.env.SMERCH_REPEATED_DOCUMENT_PREVIEW_DIR,'repeated-sku-basis.pdf'),bytes);}
}));

test('manual backoffice partial shipments still use actual line-id quantities for repeated SKUs',()=>isolated('1',async()=>{
 const customer=saveCustomer(actor,{name:'Synthetic',email:'fixture@example.test',address:'Testvej 1'}),quote=saveQuote(actor,{customerId:customer.id,paymentTerms:'Bank',freight:'0',lines:[{sku:'SAME',description:'Design A',quantity:25,unitPrice:'10',setup:'0',discountPercent:'0'},{sku:'SAME',description:'Design B',quantity:50,unitPrice:'20',setup:'0',discountPercent:'0'}]});
 quoteTransition(actor,quote.id,{version:1,status:'sent'});quoteTransition(actor,quote.id,{version:2,status:'accepted',evidence:'Synthetic consent'});const {id}=quoteTransition(actor,quote.id,{version:3,status:'converted'});db().prepare("UPDATE orders SET production_status='completed' WHERE id=?").run(id);let order=orderDetail(actor,id);
 addShipment(actor,id,{version:order.version,shippedAt:'2026-01-02',carrier:'Demo',lines:[{id:order.lines[0].id,quantity:10},{id:order.lines[1].id,quantity:5}]});const draft=await documentDraft(actor,id,'shipment');assert.deepEqual(draft.lines.map(l=>l.quantity),[10,5]);assert.equal(draft.shipmentAllocationScope,undefined);assert.deepEqual((await checkedDocument(actor,id,draft)).missing,[]);
}));
