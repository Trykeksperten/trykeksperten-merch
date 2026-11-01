import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {saveRecord,readRecord} from '../lib/backoffice/records.mjs';
import {importLegacy} from '../lib/backoffice/migration.mjs';
import {bindPFDocument} from '../lib/backoffice/pf-document-bindings.mjs';
import {companySettings,documentSeed,createOrderDocument,listOrderDocuments,readOrderDocument} from '../lib/order-documents.mjs';
import {runJobs,readDocumentForActor} from '../lib/backoffice/jobs.mjs';
import {sendOrderDocument} from '../lib/order-document-send.mjs';
import {createBackup,verifyBackup,restoreBackup} from '../lib/data-backup.mjs';

const actor={id:'system',companyId:'smerch',role:'administrator'};
async function isolated(mode,fn){const root=await mkdtemp('/tmp/smerch-document-binding-'),prior={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED};process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;try{await fn(root);}finally{closeDatabases();for(const [key,value] of [['SMERCH_DATA_DIR',prior.root],['SMERCH_DATABASE_ENABLED',prior.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}}
function fixture(){
 const checkout={id:'pay-'+randomUUID(),status:'paid',paidAt:'2026-01-01T12:00:00Z',createdAt:'2026-01-01T12:00:00Z',lines:[{sku:'A',productId:'a',productName:'Synthetic A',quantity:1},{sku:'B',productId:'b',productName:'Synthetic B',quantity:1}],quote:{lines:[{net:100,vat:25},{net:100,vat:25}],net:200,vat:50,totalIncVat:250},freightExVat:0,totalIncVat:250,shipping:{name:'Synthetic',email:'test@example.invalid',street:'Testvej 1',postalCode:'1000',city:'Test',country:'DK'},fulfillment:{groups:[{lineIndexes:[0]},{lineIndexes:[1]}]}};
 const pfs=[0,1].map(i=>({id:'ord-'+randomUUID(),checkoutId:checkout.id,checkoutGroupIndex:i,pfOrderNumber:1000+i,createdAt:checkout.createdAt,status:'shipped',lines:[checkout.lines[i]],shipping:checkout.shipping,shipment:{deliveries:[{key:'delivery-'+i,shipDate:'2026-01-02',isOrderComplete:true,items:[{sku:checkout.lines[i].sku,quantity:1}]}]},events:[]}));checkout.pfOrderIds=pfs.map(p=>p.id);return {checkout,pfs};
}
async function persist(root,{checkout,pfs},mode=process.env.SMERCH_DATABASE_ENABLED){for(const [namespace,value] of [['checkouts',checkout],...pfs.map(p=>['orders',p])])if(mode==='1')saveRecord(namespace,value.id,value);else{await mkdir(join(root,namespace),{recursive:true});await writeFile(join(root,namespace,value.id+'.json'),JSON.stringify(value));}}
async function generate(pf,checkout){const company=await companySettings(),input={...documentSeed(pf,checkout,company,'shipment'),requestId:randomUUID()},created=await createOrderDocument(pf,checkout,company,input);if(created.pending)await runJobs();return {created,record:await readOrderDocument(pf.id,created.id)};}
const markImported=()=>{db().prepare("INSERT INTO runtime_metadata VALUES('legacy_import',?)").run(JSON.stringify({counts:{checkouts:1,orders:2},dryRun:false,databaseCheck:'ok'}));db().prepare("INSERT INTO runtime_metadata VALUES('standalone_pf_documents_v1','done')").run();};
function insertHistorical(checkout,record){db().prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(record.id,'smerch',checkout.id,record.document.type,record.version,JSON.stringify(record.document),Buffer.from(record.pdf,'base64'),record.createdAt,'system');}

for(const mode of ['0','1'])test(`PF shipment documents retain their original supplier identity across sibling orders (${mode})`,()=>isolated(mode,async root=>{
 const f=fixture();await persist(root,f);const source=JSON.stringify(f),{created,record}=await generate(f.pfs[0],f.checkout);
 assert.equal(record.document.lines[0].variant,'A');assert.equal((await listOrderDocuments(f.pfs[0].id)).length,1);assert.equal((await listOrderDocuments(f.pfs[1].id)).length,0);await assert.rejects(readOrderDocument(f.pfs[1].id,created.id));
 let mails=0;await assert.rejects(sendOrderDocument(f.pfs[1],{documentId:created.id,audience:'customer',to:'test@example.invalid',subject:'Synthetic',text:'Synthetic',requestId:randomUUID()},{transport:{sendMail:async()=>{mails++;return {accepted:['test@example.invalid']};}}}));assert.equal(mails,0);assert.equal(JSON.stringify(f),source);
 if(mode==='1'){assert.equal(db().prepare('SELECT pf_order_id FROM pf_document_bindings WHERE document_id=?').get(created.id).pf_order_id,f.pfs[0].id);assert.equal(readDocumentForActor(actor,created.id).order_id,f.checkout.id);assert.deepEqual(db().pragma('foreign_key_check'),[]);}
}));

test('fresh JSON migration preserves known PF document ownership, source files and immutable PDF bytes',()=>isolated('0',async root=>{
 const f=fixture();await persist(root,f);const {record}=await generate(f.pfs[0],f.checkout),sourceFile=join(root,'order-documents',record.id+'.json'),original=await readFile(sourceFile);
 await importLegacy({dryRun:true});await assert.rejects(access(join(root,'smerch.sqlite')),{code:'ENOENT'});await importLegacy();process.env.SMERCH_DATABASE_ENABLED='1';
 const stored=await readOrderDocument(f.pfs[0].id,record.id);assert.equal(stored.pdf,record.pdf);assert.deepEqual(stored.document,record.document);await assert.rejects(readOrderDocument(f.pfs[1].id,record.id));assert.deepEqual(await readFile(sourceFile),original);assert.equal((await listOrderDocuments(f.pfs[1].id)).length,0);
 const version=db().prepare('SELECT version FROM orders WHERE id=?').get(f.checkout.id).version;await importLegacy();assert.equal(db().prepare('SELECT version FROM orders WHERE id=?').get(f.checkout.id).version,version);assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));

test('already-imported database binds an exact retained JSON document once without changing its snapshot or PDF',()=>isolated('0',async root=>{
 const f=fixture();await persist(root,f);const {record}=await generate(f.pfs[0],f.checkout);await persist(root,f,'1');insertHistorical(f.checkout,record);markImported();process.env.SMERCH_DATABASE_ENABLED='1';
 const before=db().prepare('SELECT * FROM documents WHERE id=?').get(record.id),source=db().prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(f.pfs[0].id).payload;
 await importLegacy();await importLegacy();assert.deepEqual(db().prepare('SELECT * FROM documents WHERE id=?').get(record.id),before);assert.equal(db().prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(f.pfs[0].id).payload,source);assert.equal((await readOrderDocument(f.pfs[0].id,record.id)).pdf,record.pdf);await assert.rejects(readOrderDocument(f.pfs[1].id,record.id));assert.equal(db().prepare('SELECT count(*) n FROM pf_document_bindings').get().n,1);
}));

test('unknown historical owner is never inferred from sibling checkout membership; backoffice access remains',()=>isolated('1',async root=>{
 const f=fixture();await persist(root,f);const id=randomUUID(),pdf=Buffer.from('%PDF-1.7\nSynthetic immutable history');db().prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(id,'smerch',f.checkout.id,'shipment',1,'{}',pdf,'2026-01-02','system');markImported();await importLegacy();
 for(const pf of f.pfs){assert.equal((await listOrderDocuments(pf.id)).length,0);await assert.rejects(readOrderDocument(pf.id,id));}
 assert.deepEqual(readDocumentForActor(actor,id).pdf,pdf);assert.equal(db().prepare('SELECT count(*) n FROM pf_document_bindings').get().n,0);assert.equal(db().prepare("SELECT value FROM runtime_metadata WHERE key='pf_document_bindings_v1'").get()!=null,true);
}));

for(const conflict of ['owner','pdf','snapshot'])test(`conflicting retained document ${conflict} rolls back bindings and keeps original evidence`,()=>isolated('0',async root=>{
 const f=fixture();await persist(root,f);const first=(await generate(f.pfs[0],f.checkout)).record,second=(await generate(f.pfs[0],f.checkout)).record;first.createdAt='2026-01-02T00:00:00Z';second.createdAt='2026-01-03T00:00:00Z';
 for(const record of [first,second])await writeFile(join(root,'order-documents',record.id+'.json'),JSON.stringify(record));await persist(root,f,'1');insertHistorical(f.checkout,first);insertHistorical(f.checkout,second);
 if(conflict==='owner')bindPFDocument(second.id,f.pfs[1].id);else if(conflict==='pdf')db().prepare('UPDATE documents SET pdf=? WHERE id=?').run(Buffer.from('%PDF-1.7\nDifferent immutable PDF'),second.id);else db().prepare('UPDATE documents SET snapshot_json=? WHERE id=?').run('{"different":true}',second.id);
 const before=db().prepare('SELECT * FROM documents ORDER BY id').all();markImported();process.env.SMERCH_DATABASE_ENABLED='1';await assert.rejects(importLegacy(),/matcher|anden PF-ordre/);
 assert.deepEqual(db().prepare('SELECT * FROM documents ORDER BY id').all(),before);assert.equal(db().prepare('SELECT count(*) n FROM pf_document_bindings WHERE document_id=?').get(first.id).n,0);assert.equal(db().prepare("SELECT value FROM runtime_metadata WHERE key='pf_document_bindings_v1'").get(),undefined);assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));

test('verified backup and isolated restore preserve bindings, standalone PDFs, claims and source identity with original root unavailable',()=>isolated('1',async root=>{
 const source=join(root,'source');await mkdir(source);process.env.SMERCH_DATA_DIR=source;const f=fixture();await persist(source,f);const linked=await generate(f.pfs[0],f.checkout),standalone={...f.pfs[1],id:'ord-'+randomUUID(),checkoutId:undefined};delete standalone.checkoutGroupIndex;saveRecord('orders',standalone.id,standalone);const own=await generate(standalone,null);
 await mkdir(join(source,'payment-operation-claims'));await writeFile(join(source,'payment-operation-claims','synthetic.json'),'{"operation":"quickpay-create"}');const snapshots=db().prepare('SELECT namespace,id,payload FROM records ORDER BY namespace,id').all();closeDatabases();
 const backup=join(root,'backup'),restored=join(root,'restored');await createBackup(source,backup);await verifyBackup(backup);await restoreBackup(backup,restored);await rename(source,join(root,'source-preserved'));process.env.SMERCH_DATA_DIR=restored;
 assert.equal((await readOrderDocument(f.pfs[0].id,linked.created.id)).pdf,linked.record.pdf);await assert.rejects(readOrderDocument(f.pfs[1].id,linked.created.id));assert.equal((await readOrderDocument(standalone.id,own.created.id)).pdf,own.record.pdf);assert.deepEqual(db().prepare('SELECT namespace,id,payload FROM records ORDER BY namespace,id').all(),snapshots);assert.equal(await readFile(join(restored,'payment-operation-claims','synthetic.json'),'utf8'),'{"operation":"quickpay-create"}');assert.equal(db().pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));

test('v6 to v7 migration preserves historical checksums and documents without inventing bindings',()=>isolated('1',async root=>{
 const f=fixture();await persist(root,f);const {record}=await generate(f.pfs[0],f.checkout),before=db().prepare('SELECT * FROM documents WHERE id=?').get(record.id),checksums=db().prepare("SELECT version,checksum FROM migrations WHERE version<'007' ORDER BY version").all();
 db().exec('DROP TABLE pf_document_bindings');db().prepare("DELETE FROM migrations WHERE version='007-pf-document-bindings.sql'").run();closeDatabases();assert.deepEqual(db().prepare("SELECT version,checksum FROM migrations WHERE version<'007' ORDER BY version").all(),checksums);assert.deepEqual(db().prepare('SELECT * FROM documents WHERE id=?').get(record.id),before);assert.equal(db().prepare('SELECT count(*) n FROM pf_document_bindings').get().n,0);assert.deepEqual(db().pragma('foreign_key_check'),[]);
}));
