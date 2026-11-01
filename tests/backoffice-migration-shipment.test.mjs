import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {PDFDocument} from 'pdf-lib';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {saveRecord,readRecord,reconcileStoredPFProjections} from '../lib/backoffice/records.mjs';
import {importLegacy} from '../lib/backoffice/migration.mjs';
import {orderDetail} from '../lib/backoffice/operations.mjs';
import {documentDraft,runJobs} from '../lib/backoffice/jobs.mjs';
import {companySettings,documentSeed,createOrderDocument,readOrderDocument} from '../lib/order-documents.mjs';
import {reconcileSalesShipments} from '../lib/sales-ledger.mjs';
import {shipmentRecord} from '../lib/pf-shipment.mjs';
import {applyPFNotification} from '../lib/pf-orders.mjs';

const actor={id:'system',companyId:'smerch',role:'administrator'};
async function isolated(mode,fn){
 const prior={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED},root=await mkdtemp(join(tmpdir(),'smerch-shipment-migration-'));
 process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;
 try{return await fn(root);}finally{closeDatabases();for(const [key,value] of [['SMERCH_DATA_DIR',prior.root],['SMERCH_DATABASE_ENABLED',prior.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}
}
function fixture(){
 const id='pay-'+randomUUID(),uuid=randomUUID(),pfId='ord-'+uuid;
 const checkout={id,status:'authorized',createdAt:'2026-01-01',lines:[{sku:'DEMO',productId:'demo',productName:'Demovare',quantity:4,decorations:[]}],shipping:{name:'Demo',street:'Eksempelvej 1',city:'København',postalCode:'2300',country:'DK',email:'demo@example.test'},billing:{company:'Demo',address:'Eksempelvej 1, 2300 København',country:'DK'},legal:{customerType:'consumer'},quote:{net:400,vat:100,totalIncVat:500,lines:[{net:400,vat:100,totalIncVat:500}]},freightExVat:0,freightIncVat:0,totalIncVat:500,pfOrderIds:[pfId],fulfillment:{groups:[{lineIndexes:[0]}]}};
 const pf={id:pfId,checkoutId:id,checkoutGroupIndex:0,purchaseOrderNumber:'SMERCH-'+uuid,createdAt:checkout.createdAt,status:'processing',lines:checkout.lines,shipping:checkout.shipping,events:[]};return {checkout,pf};
}
const parcel=(quantity,{complete=false,date='2026-01-02',reference=randomUUID()}={})=>shipmentRecord({shipDate:date,carrier:'Demo',reference,isOrderComplete:complete,item:[{sku:'DEMO',quantity}],trackAndTrace:[{trackingId:reference,trackingURL:'https://example.test/tracking'}]});
function shipped(pf,deliveries){return {...pf,status:deliveries.some(d=>d.isOrderComplete)?'shipped':'partially_shipped',shipment:{isOrderComplete:deliveries.some(d=>d.isOrderComplete),shipDate:deliveries.at(-1)?.shipDate,deliveries,issues:[]}};}
async function persist(root,checkout,pf){
 if(process.env.SMERCH_DATABASE_ENABLED==='1'){saveRecord('checkouts',checkout.id,checkout);saveRecord('orders',pf.id,pf);return;}
 for(const [directory,value] of [['checkouts',checkout],['orders',pf]]){await mkdir(join(root,directory),{recursive:true});await writeFile(join(root,directory,value.id+'.json'),JSON.stringify(value));}
}

for(const mode of ['0','1'])test(`actual partial quantities agree in finance and SQLite import (source mode ${mode})`,()=>isolated(mode,async root=>{
 const {checkout,pf}=fixture(),first=parcel(2),second=parcel(2,{complete:true,date:'2026-01-03'});
 await persist(root,checkout,shipped(pf,[first]));
 let ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.problems,[]);assert.equal(ledger.shipments[0].lines[0].quantity,2);
 if(mode==='0'){await importLegacy();process.env.SMERCH_DATABASE_ENABLED='1';}
 let detail=orderDetail(actor,checkout.id);assert.equal(detail.delivery_status,'partial');assert.equal(detail.production_status!=='completed',true);assert.equal(detail.lines[0].shipped,2);assert.equal((await documentDraft(actor,checkout.id,'shipment')).lines[0].quantity,2);
 let current=readRecord('orders',pf.id);Object.assign(current,shipped(current,[first,second]));saveRecord('orders',pf.id,current);saveRecord('orders',pf.id,readRecord('orders',pf.id));
 detail=orderDetail(actor,checkout.id);assert.equal(detail.shipments.length,2);assert.equal(detail.lines[0].shipped,4);assert.equal(detail.delivery_status,'shipped');assert.equal(detail.production_status,'completed');assert.equal(detail.payment_status,'reserved');assert.equal((await documentDraft(actor,checkout.id,'shipment')).lines[0].quantity,2);
 ledger=await reconcileSalesShipments(checkout.id);assert.equal(ledger.shipments.length,2);assert.deepEqual(ledger.problems,[]);assert.equal(ledger.shipments.reduce((n,s)=>n+s.total,0),checkout.totalIncVat);
}));

for(const [name,change] of [
 ['complete quantity mismatch',pf=>shipped(pf,[parcel(2,{complete:true})])],
 ['future shipment',pf=>shipped(pf,[parcel(4,{complete:true,date:'2099-01-01'})])],
 ['completion without item evidence',pf=>({...pf,status:'shipped',shipment:{isOrderComplete:true,shipDate:'2026-01-02'}})],
 ['cancelled shipment',pf=>({...shipped(pf,[parcel(4,{complete:true})]),pfCancellation:{receivedAt:'2026-01-01'}})]
])for(const mode of ['0','1'])test(`${name} never creates quantities or a shipment document (source mode ${mode})`,()=>isolated(mode,async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,change(pf));const ledger=await reconcileSalesShipments(checkout.id);assert.equal(ledger.shipments.length,0);assert.ok(ledger.problems.length);
 if(mode==='0'){await importLegacy();process.env.SMERCH_DATABASE_ENABLED='1';}
 const detail=orderDetail(actor,checkout.id);assert.equal(detail.lines[0].shipped,0);assert.equal(detail.delivery_status,'unshipped');assert.equal(detail.production_status,'waiting');assert.equal(detail.payment_status,'reserved');await assert.rejects(documentDraft(actor,checkout.id,'shipment'),/dokumenterede antal/);
}));

test('real PF notification mismatch stays needs_attention with no invented projection',()=>isolated('1',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);
 const result=await applyPFNotification('shipment',{ShipmentNotification:{messageId:randomUUID(),deliveries:[{deliveryLocation:{customerPONumber:pf.purchaseOrderNumber,carrier:'Demo',shipDate:'2026-01-02',isOrderComplete:true,item:[{sku:'DEMO',quantity:2}]}}]}});
 assert.equal(result.status,'needs_attention');assert.ok(result.shipment.issues.length);assert.equal(orderDetail(actor,checkout.id).lines[0].shipped,0);
}));

test('tracking enrichment keeps one parcel; a later cancelled state removes its generated quantities',()=>isolated('1',async root=>{
 const {checkout,pf}=fixture(),delivery=parcel(4,{complete:true});await persist(root,checkout,shipped(pf,[delivery]));
 let current=readRecord('orders',pf.id);current.shipment.deliveries[0].trackingDetails[0].trackingURL='https://example.test/updated';saveRecord('orders',pf.id,current);
 let detail=orderDetail(actor,checkout.id);assert.equal(detail.shipments.length,1);assert.equal(detail.shipments[0].tracking_url,'https://example.test/updated');assert.equal(detail.lines[0].shipped,4);
 current=readRecord('orders',pf.id);current.status='needs_attention';current.pfCancellation={receivedAt:'2026-01-03'};saveRecord('orders',pf.id,current);
 detail=orderDetail(actor,checkout.id);assert.equal(detail.shipments.length,0);assert.equal(detail.lines[0].shipped,0);assert.equal(detail.delivery_status,'unshipped');assert.equal(detail.production_status,'waiting');
 await assert.rejects(documentDraft(actor,checkout.id,'shipment'),/dokumenterede antal/);
}));

test('ambiguous checkout SKU mapping cannot project or finance a delivery',()=>isolated('1',async root=>{
 const {checkout,pf}=fixture();checkout.lines.push({...checkout.lines[0]});checkout.fulfillment.groups[0].lineIndexes.push(1);pf.lines=checkout.lines;
 await persist(root,checkout,shipped(pf,[parcel(4)]));assert.deepEqual(orderDetail(actor,checkout.id).lines.map(l=>l.shipped),[0,0]);const ledger=await reconcileSalesShipments(checkout.id);assert.equal(ledger.shipments.length,0);assert.ok(ledger.problems.some(p=>p.includes('SKU')));
}));

test('startup repairs old PF projections once, preserves source/manual/documents, and rolls back failures',()=>isolated('1',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,shipped(pf,[parcel(2,{complete:true})]));
 const connection=db(),pdf=Buffer.from('%PDF-1.7\nsynthetic archived snapshot'),docId=randomUUID();
 connection.prepare('INSERT INTO shipments VALUES(?,?,?,?,?,?,?)').run('pf-'+pf.id,checkout.id,'2026-01-02','Demo',null,null,'system');connection.prepare('INSERT INTO shipment_lines VALUES(?,?,?)').run('pf-'+pf.id,checkout.id+':0',4);
 connection.prepare('INSERT INTO shipments VALUES(?,?,?,?,?,?,?)').run('manual-record',checkout.id,'2026-01-02','Demo',null,null,'system');connection.prepare('INSERT INTO shipment_lines VALUES(?,?,?)').run('manual-record',checkout.id+':0',1);
 connection.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(docId,'smerch',checkout.id,'shipment',1,'{}',pdf,'2026-01-02','system');
 connection.prepare("INSERT INTO runtime_metadata VALUES('legacy_import',?)").run(JSON.stringify({counts:{checkouts:1,orders:1},dryRun:false,databaseCheck:'ok'}));
 const source=connection.prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(pf.id).payload;
 connection.exec("CREATE TRIGGER stop_projection BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 assert.throws(()=>reconcileStoredPFProjections(),/synthetic failure/);assert.ok(connection.prepare('SELECT id FROM shipments WHERE id=?').get('pf-'+pf.id));assert.equal(connection.prepare("SELECT value FROM runtime_metadata WHERE key='pf_shipment_projection_v2'").get(),undefined);connection.exec('DROP TRIGGER stop_projection');
 await importLegacy();assert.equal(connection.prepare('SELECT id FROM shipments WHERE id=?').get('pf-'+pf.id),undefined);assert.ok(connection.prepare("SELECT id FROM shipments WHERE id='manual-record'").get());assert.deepEqual(connection.prepare('SELECT pdf FROM documents WHERE id=?').get(docId).pdf,pdf);assert.equal(connection.prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(pf.id).payload,source);
 const version=orderDetail(actor,checkout.id).version;await importLegacy();assert.equal(orderDetail(actor,checkout.id).version,version);assert.deepEqual(connection.pragma('foreign_key_check'),[]);
}));

async function legacyDocuments(root,pf,types=['confirmation','basis','shipment','receipt']){
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());await mkdir(join(root,'order-documents'),{recursive:true});
 const records=types.map(type=>({id:randomUUID(),orderId:pf.id,createdAt:'2026-01-02T00:00:00Z',document:{type,reference:'Demo'},pdf:bytes.toString('base64')}));
 for(const d of records)await writeFile(join(root,'order-documents',d.id+'.json'),JSON.stringify(d));return {records,bytes};
}
test('dry-run validates all four document types without creating SQLite; import preserves their PDFs',()=>isolated('0',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);const {records,bytes}=await legacyDocuments(root,pf);
 assert.equal((await importLegacy({dryRun:true})).counts.documents,4);await assert.rejects(access(join(root,'smerch.sqlite')),{code:'ENOENT'});
 await importLegacy();assert.deepEqual(db().prepare('SELECT type FROM documents ORDER BY type').all().map(d=>d.type),['basis','confirmation','receipt','shipment']);for(const d of records)assert.deepEqual(db().prepare('SELECT pdf FROM documents WHERE id=?').get(d.id).pdf,bytes);assert.deepEqual(db().pragma('foreign_key_check'),[]);await importLegacy();assert.equal(db().prepare('SELECT count(*) n FROM documents').get().n,4);
}));
test('dry-run and real import reject an unsupported document type before importing orders',()=>isolated('0',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);await legacyDocuments(root,pf,['confirmation','unsupported']);await assert.rejects(importLegacy({dryRun:true}),/dokumenttype/);await assert.rejects(access(join(root,'smerch.sqlite')),{code:'ENOENT'});await assert.rejects(importLegacy(),/dokumenttype/);assert.equal(db().prepare('SELECT count(*) n FROM orders').get().n,0);assert.equal(db().prepare('SELECT count(*) n FROM documents').get().n,0);
}));
test('forward schema upgrade preserves historical migration checksums, existing PDFs and uniqueness',()=>isolated('1',async root=>{
 const connection=new Database(join(root,'smerch.sqlite'));connection.pragma('foreign_keys=ON');connection.exec('CREATE TABLE migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
 const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^00[1-4].*\.sql$/.test(n)).sort(),checksums=[];
 for(const name of files){const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'),hash=createHash('sha256').update(sql).digest('hex');connection.exec(sql);connection.prepare('INSERT INTO migrations VALUES(?,?,?)').run(name,hash,'2026-01-01');checksums.push({version:name,checksum:hash});}
 const id='pay-'+randomUUID(),docId=randomUUID(),pdf=Buffer.from('%PDF-1.7\narchived synthetic PDF');connection.prepare('INSERT INTO orders(id,company_id,source,source_id,order_status,payment_status,production_status,delivery_status,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'smerch','checkout',id,'confirmed','reserved','waiting','unshipped','{}','2026-01-01');connection.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(docId,'smerch',id,'basis',1,'{"type":"basis"}',pdf,'2026-01-01','system');connection.close();
 const upgraded=db();assert.deepEqual(upgraded.prepare('SELECT version,checksum FROM migrations WHERE version<? ORDER BY version').all('005'),checksums);assert.deepEqual(upgraded.prepare('SELECT pdf FROM documents WHERE id=?').get(docId).pdf,pdf);upgraded.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),'smerch',id,'confirmation',1,'{}',pdf,'2026-01-02','system');assert.throws(()=>upgraded.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),'smerch',id,'confirmation',1,'{}',pdf,'2026-01-02','system'),/UNIQUE/);assert.deepEqual(upgraded.pragma('foreign_key_check'),[]);assert.equal(upgraded.pragma('integrity_check',{simple:true}),'ok');
}));
test('confirmation creation queues and renders in SQLite after schema migration',()=>isolated('1',async root=>{
 const {checkout,pf}=fixture();await persist(root,checkout,pf);const company=await companySettings(),draft=documentSeed(pf,checkout,company,'confirmation');draft.requestId=randomUUID();const result=await createOrderDocument(pf,checkout,company,draft);assert.equal(result.pending,true);await runJobs();const stored=await readOrderDocument(pf.id,result.id);assert.equal(stored.document.type,'confirmation');assert.ok((await PDFDocument.load(Buffer.from(stored.pdf,'base64'))).getPageCount());
}));
