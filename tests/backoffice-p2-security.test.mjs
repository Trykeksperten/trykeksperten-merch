import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PDFDocument,PDFName} from 'pdf-lib';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {saveRecord,readRecord} from '../lib/backoffice/records.mjs';
import {orderDetail} from '../lib/backoffice/operations.mjs';
import {importLegacy} from '../lib/backoffice/migration.mjs';
import {validateFile} from '../lib/backoffice/files.mjs';
import {companySettings,documentSeed,createOrderDocument,listOrderDocuments,readOrderDocument} from '../lib/order-documents.mjs';
import {checkoutPaymentProjection} from '../lib/backoffice/checkout-payment.mjs';
import {standalonePFSourceVersion,storeStandalonePFDocument} from '../lib/backoffice/pf-documents.mjs';

const actor={id:'system',companyId:'smerch',role:'administrator'};
async function isolated(mode,fn){
 const previous={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED},root=await mkdtemp(join(tmpdir(),'smerch-security-p2-'));
 process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;
 try{await fn(root);}finally{closeDatabases();for(const [key,value] of [['SMERCH_DATA_DIR',previous.root],['SMERCH_DATABASE_ENABLED',previous.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}
}
function checkout(){return {id:'pay-'+randomUUID(),createdAt:'2026-01-01',status:'authorized',shipping:{name:'Demo',email:'demo@example.test'},lines:[{sku:'DEMO',quantity:2}],quote:{lines:[{net:8000,vat:2000}]},totalIncVat:10000};}
function pfOrder(){return {id:'ord-'+randomUUID(),pfOrderNumber:1234,createdAt:'2026-01-01',status:'shipped',lines:[{sku:'DEMO',productName:'Demovare',quantity:2}],shipping:{name:'Demo',street:'Eksempelvej 1',postalCode:'2300',city:'København',country:'DK',email:'demo@example.test'},shipment:{isOrderComplete:true,shipDate:'2026-01-02',deliveries:[{key:'parcel-1',shipDate:'2026-01-02',carrier:'Demo',isOrderComplete:true,items:[{sku:'DEMO',quantity:2}]}]},events:[]};}
async function legacyPF(root,order){await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',order.id+'.json'),JSON.stringify(order));}
async function generate(order,checkout=null){const company=await companySettings(),input={...documentSeed(order,checkout,company,'shipment'),requestId:randomUUID()};return {input,company,result:await createOrderDocument(order,checkout,company,input)};}

test('partial capture and refund projections preserve confirmation and actual totals',()=>isolated('1',async()=>{
 const order=checkout();saveRecord('checkouts',order.id,order);
 const cases=[
  {status:'partially_paid',captured:5000,refunded:0,expected:'partially_paid'},
  {status:'paid',captured:10000,refunded:0,expected:'paid',paidAt:'2026-01-03'},
  {status:'paid',captured:10000,refunded:3000,expected:'partially_refunded',paidAt:'2026-01-03'},
  {status:'paid',captured:10000,refunded:10000,expected:'refunded',paidAt:'2026-01-03'}
 ];
 for(const row of cases){const current=readRecord('checkouts',order.id);current.status=row.status;current.paymentTotals={captured:row.captured,refunded:row.refunded};if(row.paidAt)current.paidAt=row.paidAt;saveRecord('checkouts',order.id,current);const projected=orderDetail(actor,order.id);assert.equal(projected.order_status,'confirmed');assert.equal(projected.payment_status,row.expected);assert.deepEqual(projected.paymentTotals,{captured:row.captured,refunded:row.refunded,netPaid:row.captured-row.refunded});assert.equal(projected.snapshot.status,'authorized');assert.equal(projected.paid_at,row.paidAt||null);}
}));
test('invalid totals require reconciliation; authorization never fabricates captured money',()=>{
 const order=checkout();assert.deepEqual(checkoutPaymentProjection(order).totals,null);assert.equal(checkoutPaymentProjection(order).status,'reserved');
 for(const paymentTotals of [{captured:-1,refunded:0},{captured:5000,refunded:6000},{captured:10001,refunded:0},{captured:5000.5,refunded:0}]){const value=checkoutPaymentProjection({...order,paymentTotals});assert.equal(value.status,'needs_reconciliation');assert.equal(value.totals,null);}
 assert.equal(checkoutPaymentProjection({...order,status:'partially_paid'}).status,'partially_paid');
});
test('already-imported SQLite payment projection repairs once without changing source evidence',()=>isolated('1',async()=>{
 const order={...checkout(),status:'partially_paid',paymentTotals:{captured:5000,refunded:0}};saveRecord('checkouts',order.id,order);const source=db().prepare("SELECT payload FROM records WHERE namespace='checkouts' AND id=?").get(order.id).payload;
 db().prepare("UPDATE orders SET payment_status='unpaid',order_status='pending_payment' WHERE id=?").run(order.id);db().prepare("INSERT INTO runtime_metadata VALUES('legacy_import',?)").run(JSON.stringify({dryRun:false,counts:{checkouts:1,orders:0},databaseCheck:'ok'}));
 await importLegacy();const detail=orderDetail(actor,order.id);assert.equal(detail.payment_status,'partially_paid');assert.equal(detail.order_status,'confirmed');assert.equal(db().prepare("SELECT payload FROM records WHERE namespace='checkouts' AND id=?").get(order.id).payload,source);await importLegacy();assert.equal(orderDetail(actor,order.id).version,detail.version);
}));

for(const mode of ['0','1'])test(`standalone PF create/list/download use the same storage (mode ${mode})`,()=>isolated(mode,async root=>{
 const order=pfOrder();if(mode==='1')saveRecord('orders',order.id,order);else await legacyPF(root,order);
 const {input,company,result}=await generate(order);assert.equal((await listOrderDocuments(order.id)).length,1);const stored=await readOrderDocument(order.id,result.id);assert.equal(stored.version,1);assert.equal(stored.document.type,'shipment');assert.equal((await PDFDocument.load(Buffer.from(stored.pdf,'base64'))).getPageCount(),1);
 assert.equal((await createOrderDocument(order,null,company,input)).id,result.id);assert.equal((await listOrderDocuments(order.id)).length,1);
 await assert.rejects(readOrderDocument('ord-'+randomUUID(),result.id));
 if(mode==='1'){assert.equal(db().prepare('SELECT count(*) n FROM orders').get().n,0);assert.equal(db().prepare('SELECT count(*) n FROM pf_documents').get().n,1);await assert.rejects(access(join(root,'order-documents')),{code:'ENOENT'});assert.deepEqual(db().pragma('foreign_key_check'),[]);}
}));
test('standalone source changes block stale rendered documents and request reuse changes',()=>isolated('1',async()=>{
 const order=pfOrder();saveRecord('orders',order.id,order);const {input,company,result}=await generate(order);await assert.rejects(createOrderDocument(order,null,company,{...input,notes:'Ændret indhold'}),/andre oplysninger/);
 const version=standalonePFSourceVersion(order),current=readRecord('orders',order.id);current.status='needs_attention';saveRecord('orders',order.id,current);
 const pdf=Buffer.from((await readOrderDocument(order.id,result.id)).pdf,'base64');assert.throws(()=>storeStandalonePFDocument(order,input,{...input,requestId:randomUUID()},pdf,version),/ændret/);assert.equal(db().prepare('SELECT count(*) n FROM pf_documents').get().n,1);
}));
test('fresh migration preserves standalone document IDs, versions, snapshots and PDFs',()=>isolated('0',async root=>{
 const order=pfOrder();await legacyPF(root,order);const first=await generate(order),second=await generate(order),original=[];
 for(const result of [first.result,second.result])original.push({path:join(root,'order-documents',result.id+'.json'),bytes:await readFile(join(root,'order-documents',result.id+'.json')),record:await readOrderDocument(order.id,result.id)});
 assert.equal((await importLegacy({dryRun:true})).counts.documents,2);await assert.rejects(access(join(root,'smerch.sqlite')),{code:'ENOENT'});await importLegacy();process.env.SMERCH_DATABASE_ENABLED='1';assert.equal((await listOrderDocuments(order.id)).length,2);
 for(const old of original){const current=await readOrderDocument(order.id,old.record.id);assert.equal(current.id,old.record.id);assert.equal(current.version,old.record.version);assert.deepEqual(current.document,old.record.document);assert.equal(current.pdf,old.record.pdf);assert.deepEqual(await readFile(old.path),old.bytes);}
 assert.equal(db().prepare('SELECT count(*) n FROM orders').get().n,0);assert.deepEqual(db().pragma('foreign_key_check'),[]);await importLegacy();assert.equal((await listOrderDocuments(order.id)).length,2);
}));
test('alreadyImported startup recovers previously skipped standalone JSON documents once',()=>isolated('0',async root=>{
 const order=pfOrder();await legacyPF(root,order);const {result}=await generate(order),original=await readOrderDocument(order.id,result.id);saveRecord('orders',order.id,order);db().prepare("INSERT INTO runtime_metadata VALUES('legacy_import',?)").run(JSON.stringify({dryRun:false,counts:{checkouts:0,orders:1},databaseCheck:'ok'}));process.env.SMERCH_DATABASE_ENABLED='1';
 assert.equal((await listOrderDocuments(order.id)).length,0);await importLegacy();assert.equal((await readOrderDocument(order.id,result.id)).pdf,original.pdf);await importLegacy();assert.equal((await listOrderDocuments(order.id)).length,1);assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));

test('standalone admin presentation can enrich empty product labels without changing source evidence',()=>isolated('1',async()=>{
 const order=pfOrder();order.lines[0].productName='';order.lines[0].color='';saveRecord('orders',order.id,order);const presented={...order,lines:[{...order.lines[0],productName:'Demovare',color:'Blå',size:'M'}],proofIntakeProblems:[]};const {result}=await generate(presented);assert.equal((await readOrderDocument(order.id,result.id)).document.lines[0].description,'Demovare');assert.equal(readRecord('orders',order.id).lines[0].productName,'');
}));

test('v5 to v6 upgrade preserves existing customer documents and historical checksums',()=>isolated('1',async()=>{
 const order=checkout();saveRecord('checkouts',order.id,order);const id=randomUUID(),pdf=Buffer.from('%PDF-1.7\nSynthetic historical PDF');db().prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(id,'smerch',order.id,'confirmation',1,'{}',pdf,'2026-01-01','system');const checksums=db().prepare("SELECT version,checksum FROM migrations WHERE version<'006' ORDER BY version").all();
 db().exec('DROP TABLE pf_documents');db().prepare("DELETE FROM migrations WHERE version='006-standalone-pf-documents.sql'").run();closeDatabases();assert.deepEqual(db().prepare("SELECT version,checksum FROM migrations WHERE version<'006' ORDER BY version").all(),checksums);assert.deepEqual(db().prepare('SELECT pdf FROM documents WHERE id=?').get(id).pdf,pdf);assert.equal(db().prepare('SELECT count(*) n FROM pf_documents').get().n,0);assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));

const upload=bytes=>validateFile({name:'synthetic.pdf',base64:Buffer.from(bytes).toString('base64')});
for(const compressed of [true,false])test(`PDF validation rejects parsed harmless JavaScript action (object streams ${compressed})`,async()=>{
 const document=await PDFDocument.create();document.addPage();document.addJavaScript('harmless-fixture','void(0)');const bytes=await document.save({useObjectStreams:compressed});if(compressed)assert.equal(/\/(JavaScript|JS)\b/.test(Buffer.from(bytes).toString('latin1')),false);await assert.rejects(upload(bytes),/Aktivt indhold/);
});
test('PDF validation rejects nested actions and embedded files without executing content',async()=>{
 const document=await PDFDocument.create(),page=document.addPage();page.node.set(PDFName.of('AA'),document.context.obj({O:{S:'JavaScript',JS:'void(0)'}}));await assert.rejects(upload(await document.save()),/Aktivt indhold/);
 const attached=await PDFDocument.create();attached.addPage();await attached.attach(Buffer.from('Harmless synthetic text'),'fixture.txt');await assert.rejects(upload(await attached.save()),/indlejrede filer/);
});
test('PDF validation decodes ordinary escaped names before checking action dictionaries',async()=>{
 const objects=['<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>','<< /S /Java#53cript /J#53 (void\\(0\\)) >>'];
 let source='%PDF-1.7\n';const offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(source));source+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(source);source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 assert.equal(/\/(JavaScript|JS)\b/.test(source),false);await assert.rejects(upload(Buffer.from(source)),/Aktivt indhold/);
});
test('PDF object reference cycles remain bounded and do not change a clean document',async()=>{
 const document=await PDFDocument.create();document.addPage();const dictionary=document.context.obj({}),reference=document.context.register(dictionary);dictionary.set(PDFName.of('Self'),reference);document.catalog.set(PDFName.of('Fixture'),reference);const bytes=await document.save();assert.deepEqual((await upload(bytes)).bytes,Buffer.from(bytes));
});
test('ordinary compressed PDF text, normal link annotations and image uploads remain accepted',async()=>{
 const document=await PDFDocument.create(),page=document.addPage();page.drawText('Ordinary text mentioning /JavaScript and /JS is not an action.');page.node.set(PDFName.of('Annots'),document.context.obj([{Type:'Annot',Subtype:'Link',Rect:[0,0,10,10],A:{S:'URI',URI:'https://example.test'}}]));const bytes=await document.save();const validated=await upload(bytes);assert.equal(validated.mime,'application/pdf');assert.deepEqual(validated.bytes,Buffer.from(bytes));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');assert.equal((await validateFile({name:'fixture.png',base64:png.toString('base64')})).mime,'image/png');
});
