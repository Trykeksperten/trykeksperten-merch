import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {shipmentRecord,shipmentProblems,validatedPFDeliveries,validatedPFOrderDeliveries} from '../lib/pf-shipment.mjs';
import {allocateShipment} from '../lib/sales-finance.mjs';
import {ledgerOrder,reconcileSalesShipments,withLedger} from '../lib/sales-ledger.mjs';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
import {readRecord,saveRecord,reconcileStoredPFProjections} from '../lib/backoffice/records.mjs';
import {orderDetail} from '../lib/backoffice/operations.mjs';
import {checkoutReadyForCapture} from '../lib/order-flow.mjs';
import {readCheckout} from '../lib/checkout.mjs';

const actor={id:'system',companyId:'smerch',role:'administrator'};
function fixture({mixed=false}={}){
 const id='pay-'+randomUUID(),pfId='ord-'+randomUUID();
 const lines=[{productId:'demo',sku:'SAME',quantity:2,decorations:[{text:'Design A'}]},{productId:'demo',sku:'SAME',quantity:3,decorations:[{text:'Design B'}]},...(mixed?[{productId:'other',sku:'OTHER',quantity:1,decorations:[{text:'Design C'}]}]:[])];
 const quotes=[{net:200,vat:50,totalIncVat:250},{net:900,vat:225,totalIncVat:1125},...(mixed?[{net:400,vat:100,totalIncVat:500}]:[])];
 const net=quotes.reduce((n,q)=>n+q.net,0),vat=quotes.reduce((n,q)=>n+q.vat,0);
 const checkout={id,createdAt:'2026-01-01',status:'authorized',lines,quote:{net,vat,totalIncVat:net+vat,lines:quotes},freightExVat:100,freightIncVat:125,totalIncVat:net+vat+125,billing:{country:'DK'},shipping:{country:'DK'},legal:{customerType:'consumer'},pfOrderIds:[pfId],fulfillment:{groups:[{lineIndexes:lines.map((_,i)=>i),location:'PL',kind:'printed'}]}};
 const pf={id:pfId,checkoutId:id,checkoutGroupIndex:0,productionLocation:'PL',createdAt:'2026-01-01',status:'shipped',pfOrderNumber:'synthetic-order',lines:structuredClone(lines),events:[]};
 return {checkout,pf};
}
function parcel(items,{complete=false,date='2026-01-02',reference=randomUUID()}={}){return shipmentRecord({carrier:'Demo carrier',shipDate:date,reference,isOrderComplete:complete,item:items,trackAndTrace:[{trackingId:reference,trackingURL:'https://example.test/tracking'}]});}
function ship(pf,deliveries){pf.shipment={deliveries,issues:[],shipDate:deliveries.at(-1)?.shipDate,isOrderComplete:deliveries.some(d=>d.isOrderComplete===true)};pf.status=pf.shipment.isOrderComplete?'shipped':'partially_shipped';return pf;}
function completeFixture(options){const f=fixture(options);ship(f.pf,[parcel([{sku:'SAME',quantity:5},...(options?.mixed?[{sku:'OTHER',quantity:1}]:[])],{complete:true})]);return f;}
async function isolated(mode,fn){const old=[process.env.SMERCH_DATA_DIR,process.env.SMERCH_DATABASE_ENABLED],root=await mkdtemp(join(tmpdir(),'smerch-same-sku-'));process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED=mode;try{await fn(root);}finally{closeDatabases();for(const [i,k] of ['SMERCH_DATA_DIR','SMERCH_DATABASE_ENABLED'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];await rm(root,{recursive:true,force:true});}}
async function persist(root,checkout,pf){for(const [namespace,value] of [['checkouts',checkout],['orders',pf]])if(process.env.SMERCH_DATABASE_ENABLED==='1')saveRecord(namespace,value.id,value);else{await mkdir(join(root,namespace),{recursive:true});await writeFile(join(root,namespace,value.id+'.json'),JSON.stringify(value));}}
async function changePF(root,pf,change){if(process.env.SMERCH_DATABASE_ENABLED==='1'){const current=readRecord('orders',pf.id);change(current);saveRecord('orders',pf.id,current);return current;}change(pf);await writeFile(join(root,'orders',pf.id+'.json'),JSON.stringify(pf));return pf;}

test('complete repeated SKU maps original unequal designs once without assigning designs to a parcel',()=>{
 const {checkout,pf}=completeFixture(),before=structuredClone(pf),result=validatedPFDeliveries(pf,checkout);assert.deepEqual(result.problems,[]);assert.equal(result.deliveries.length,1);
 const d=result.deliveries[0];assert.equal(d.key,'order-complete-v1');assert.equal(d.allocationScope,'supplier_order_complete');assert.deepEqual(d.sourceDeliveryKeys,[pf.shipment.deliveries[0].key]);assert.deepEqual(d.items,[{index:0,quantity:2},{index:1,quantity:3}]);assert.deepEqual(pf,before);
 const allocated=allocateShipment(checkout,[],d.items);assert.deepEqual(allocated.lines.map(l=>[l.quantity,l.net,l.vat]),[[2,200,50],[3,900,225]]);assert.equal(allocated.freight,100);assert.equal(allocated.vat,300);assert.equal(allocated.total,1500);
 const standalone=validatedPFOrderDeliveries(pf);assert.deepEqual(standalone.deliveries[0].items,result.deliveries[0].items);assert.notEqual(standalone.deliveries[0].fingerprint,result.deliveries[0].fingerprint);
});
test('multiple actual parcels produce one stable key/fingerprint independent of input and tracking enrichment',()=>{
 const {checkout,pf}=fixture({mixed:true}),a=parcel([{sku:'SAME',quantity:2}],{reference:'first'}),b=parcel([{sku:'SAME',quantity:1},{sku:'OTHER',quantity:1},{sku:'SAME',quantity:2}],{complete:true,date:'2026-01-03',reference:'second'});ship(pf,[a,b]);
 const initial=validatedPFDeliveries(pf,checkout).deliveries[0];pf.shipment.deliveries.reverse();b.items.reverse();a.trackingDetails[0].trackingURL='https://example.test/enriched';b.trackingDetails.push({trackingId:'another',trackingURL:'https://example.test/another'});
 const updated=validatedPFDeliveries(pf,checkout).deliveries[0];assert.equal(updated.key,initial.key);assert.equal(updated.fingerprint,initial.fingerprint);assert.deepEqual(updated.sourceDeliveryKeys,[a.key,b.key].sort());assert.equal(updated.trackingDetails.length,3);assert.equal(updated.shipDate,'2026-01-03T00:00:00.000Z');assert.deepEqual(updated.items,[{index:0,quantity:2},{index:1,quantity:3},{index:2,quantity:1}]);
 b.shipDate='2026-01-04';assert.notEqual(validatedPFDeliveries(pf,checkout).deliveries[0].fingerprint,initial.fingerprint);
});
test('mixed group holds even unique SKU allocations until exact complete evidence',()=>{
 const {checkout,pf}=fixture({mixed:true});ship(pf,[parcel([{sku:'OTHER',quantity:1}])]);let result=validatedPFDeliveries(pf,checkout);assert.deepEqual(result.deliveries,[]);assert.ok(result.problems.some(p=>p.includes('Gentagne SKU')));
 pf.shipment.deliveries.push(parcel([{sku:'SAME',quantity:5}]));assert.equal(validatedPFDeliveries(pf,checkout).deliveries.length,0);
});
for(const [name,change] of [
 ['unknown SKU',f=>f.pf.shipment.deliveries[0].items.push({sku:'UNKNOWN',quantity:1})],
 ['excess quantity',f=>f.pf.shipment.deliveries[0].items[0].quantity=6],
 ['fractional quantity',f=>f.pf.shipment.deliveries[0].items[0].quantity=4.5],
 ['zero quantity',f=>f.pf.shipment.deliveries[0].items[0].quantity=0],
 ['unsafe quantity',f=>f.pf.shipment.deliveries[0].items[0].quantity=Number.MAX_SAFE_INTEGER+1],
 ['missing quantity',f=>f.pf.shipment.deliveries[0].items[0].quantity=4],
 ['missing another SKU',f=>f.pf.shipment.deliveries[0].items.pop()],
 ['empty parcel alongside real complete quantities',f=>f.pf.shipment.deliveries.push(parcel([]))],
 ['future parcel',f=>f.pf.shipment.deliveries[0].shipDate='2099-01-01'],
 ['invalid parcel date',f=>f.pf.shipment.deliveries[0].shipDate='not-a-date'],
 ['duplicate parcel key',f=>f.pf.shipment.deliveries.push(structuredClone(f.pf.shipment.deliveries[0]))],
 ['nonboolean completion',f=>{f.pf.shipment.isOrderComplete='true';f.pf.shipment.deliveries[0].isOrderComplete='true';}],
 ['top completion without parcel completion',f=>f.pf.shipment.deliveries[0].isOrderComplete=false],
 ['sticky cancellation',f=>f.pf.pfCancellation={receivedAt:'2026-01-01'}],
 ['cancelled history',f=>f.pf.events.push({type:'pf_status',pfStatus:'CANCELLED'})],
 ['unresolved supplier issue',f=>f.pf.shipment.issues=['Afstem leverancen.']],
 ['wrong checkout identity',f=>f.pf.checkoutId='pay-'+randomUUID()],
 ['unknown PF identity',f=>f.checkout.pfOrderIds=[]],
 ['wrong group index',f=>f.pf.checkoutGroupIndex=1],
 ['wrong production location',f=>f.pf.productionLocation='NL'],
 ['missing production location',f=>{delete f.pf.productionLocation;delete f.checkout.fulfillment.groups[0].location;}],
 ['empty production location',f=>{f.pf.productionLocation='';f.checkout.fulfillment.groups[0].location='';}],
 ['changed design',f=>f.pf.lines[0].decorations[0].text='Different design'],
 ['swapped original design rows',f=>f.pf.lines.reverse()],
 ['overlapping group indexes',f=>f.checkout.fulfillment.groups.push({lineIndexes:[0],location:'PL'})],
 ['duplicate group index',f=>f.checkout.fulfillment.groups[0].lineIndexes=[0,0,2]],
 ['changed original line quantity',f=>f.checkout.lines[0].quantity=1]
])test(`repeated SKU fails closed for ${name}`,()=>{const f=completeFixture({mixed:true});change(f);const result=validatedPFDeliveries(f.pf,f.checkout);assert.deepEqual(result.deliveries,[]);assert.ok(result.problems.length);});
test('supplier-only file and PMS enrichment does not invalidate immutable original design rows',()=>{const f=completeFixture();for(const l of f.pf.lines){l.supplierUnitPrice=10;l.decorations[0].pmsColors=['PMS100'];l.decorations[0].files=['synthetic.pdf'];}assert.deepEqual(validatedPFDeliveries(f.pf,f.checkout).problems,[]);});
test('duplicate-free groups keep actual partial parcel mapping and historical fingerprint',()=>{const f=fixture();f.checkout.lines[1].sku='DIFFERENT';f.pf.lines[1].sku='DIFFERENT';const d=parcel([{sku:'SAME',quantity:1}]);ship(f.pf,[d]);const result=validatedPFDeliveries(f.pf,f.checkout);assert.deepEqual(result.problems,[]);assert.deepEqual(result.deliveries[0].items,[{index:0,quantity:1}]);assert.equal(result.deliveries[0].key,d.key);assert.equal(result.deliveries[0].allocationScope,undefined);assert.equal(result.deliveries[0].fingerprint,createHash('sha256').update(JSON.stringify({items:d.items,date:d.shipDate})).digest('hex'));});
test('parcel mail quantities validate by SKU total without claiming a design',()=>{const {pf}=completeFixture(),d=pf.shipment.deliveries[0];assert.deepEqual(shipmentProblems(pf,d),[]);d.items=[{sku:'SAME',quantity:3},{sku:'SAME',quantity:3}];assert.ok(shipmentProblems(pf,d).some(p=>p.includes('vareantal')));});
for(const mode of ['0','1']){
 test(`complete repeated SKU financial allocation and legacy gate are idempotent (${mode==='1'?'SQLite':'JSON'})`,()=>isolated(mode,async root=>{
  const {checkout,pf}=completeFixture({mixed:true});await persist(root,checkout,pf);let ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.problems,[]);assert.equal(ledger.shipments.length,1);const before=structuredClone(ledger.shipments[0]);assert.equal(before.total,checkout.totalIncVat);assert.equal(before.allocationScope,'supplier_order_complete');assert.deepEqual(before.sourceDeliveryKeys,[pf.shipment.deliveries[0].key]);assert.equal(await checkoutReadyForCapture(await readCheckout(checkout.id)),true);
  await changePF(root,pf,p=>p.shipment.deliveries[0].trackingDetails.push({trackingId:'new',trackingURL:'https://example.test/new'}));ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.shipments,[before]);assert.deepEqual(ledger.problems,[]);
  if(mode==='1'){const detail=orderDetail(actor,checkout.id);assert.equal(detail.shipments.length,1);assert.deepEqual(detail.lines.map(l=>l.shipped),[2,3,1]);assert.equal(detail.delivery_status,'shipped');assert.equal(detail.production_status,'completed');}
  await changePF(root,pf,p=>p.shipment.deliveries[0].shipDate='2026-01-03');ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.shipments,[before]);assert.ok(ledger.problems.some(p=>p.includes('ændret')));
 }));
 test(`existing partial financial records and issued documents remain immutable (${mode==='1'?'SQLite':'JSON'})`,()=>isolated(mode,async root=>{
  const {checkout,pf}=completeFixture({mixed:true});await persist(root,checkout,pf);const previous={key:pf.id+':historical-parcel',source:pf.id,...allocateShipment(checkout,[],[{index:2,quantity:1}]),invoiceStatus:'issued'},document={id:'synthetic-invoice',kind:'invoice',shipmentKey:previous.key,total:previous.total,pdf:'synthetic immutable bytes'};
  await withLedger(data=>{const f=ledgerOrder(data,checkout.id);f.shipments.push(previous);f.documents.push(document);});const ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.shipments,[previous]);assert.deepEqual(ledger.documents,[document]);assert.ok(ledger.problems.some(p=>p.includes('manuel afstemning')));
 }));
 test(`mixed partial repeated SKU creates no finance allocation or capture readiness (${mode==='1'?'SQLite':'JSON'})`,()=>isolated(mode,async root=>{
  const {checkout,pf}=fixture({mixed:true});ship(pf,[parcel([{sku:'OTHER',quantity:1}])]);await persist(root,checkout,pf);const ledger=await reconcileSalesShipments(checkout.id);assert.equal(ledger.shipments.length,0);assert.ok(ledger.problems.length);assert.equal(await checkoutReadyForCapture(await readCheckout(checkout.id)),false);if(mode==='1'){const detail=orderDetail(actor,checkout.id);assert.equal(detail.shipments.length,0);assert.deepEqual(detail.lines.map(l=>l.shipped),[0,0,0]);}
 }));
}
test('SQLite existing v2 startup projection gains aggregate evidence once and preserves manual/document history',()=>isolated('1',async root=>{
 const {checkout,pf}=completeFixture();await persist(root,checkout,pf);const connection=db(),id='pf-'+pf.id+':order-complete-v1';connection.prepare('DELETE FROM shipment_lines WHERE shipment_id=?').run(id);connection.prepare('DELETE FROM shipments WHERE id=?').run(id);connection.prepare("INSERT INTO runtime_metadata VALUES('pf_shipment_projection_v2','previous-version')").run();
 const bytes=Buffer.from('synthetic immutable PDF'),docId=randomUUID();connection.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(docId,'smerch',checkout.id,'shipment',1,'{}',bytes,'2026-01-01','system');
 connection.prepare('INSERT INTO shipments VALUES(?,?,?,?,?,?,?)').run('manual-kept',checkout.id,'2026-01-01','Demo',null,null,'system');
 const source=connection.prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(pf.id).payload;
 connection.exec("CREATE TRIGGER stop_aggregate_projection BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT,'synthetic projection failure'); END");assert.throws(()=>reconcileStoredPFProjections(),/synthetic projection failure/);assert.equal(connection.prepare("SELECT value FROM runtime_metadata WHERE key='pf_shipment_projection_v3'").get(),undefined);assert.equal(connection.prepare('SELECT id FROM shipments WHERE id=?').get(id),undefined);connection.exec('DROP TRIGGER stop_aggregate_projection');
 reconcileStoredPFProjections();const detail=orderDetail(actor,checkout.id);assert.deepEqual(detail.lines.map(l=>l.shipped),[2,3]);assert.equal(detail.shipments.length,2);assert.deepEqual(connection.prepare('SELECT pdf FROM documents WHERE id=?').get(docId).pdf,bytes);assert.equal(connection.prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(pf.id).payload,source);assert.equal(connection.prepare("SELECT value FROM runtime_metadata WHERE key='pf_shipment_projection_v2'").get().value,'previous-version');assert.ok(connection.prepare("SELECT value FROM runtime_metadata WHERE key='pf_shipment_projection_v3'").get());
 reconcileStoredPFProjections();assert.equal(orderDetail(actor,checkout.id).version,detail.version);assert.deepEqual(connection.pragma('foreign_key_check'),[]);
}));

test('same SKU in another supplier group cannot satisfy or steal repeated-group quantities',()=>{
 const {checkout,pf}=fixture();checkout.lines.splice(1,0,{productId:'demo',sku:'SAME',quantity:7,decorations:[{text:'Other supplier group'}]});checkout.fulfillment.groups=[{lineIndexes:[0,2],location:'PL'},{lineIndexes:[1],location:'NL'}];const other={...structuredClone(pf),id:'ord-'+randomUUID(),checkoutGroupIndex:1,productionLocation:'NL',lines:[checkout.lines[1]]};checkout.pfOrderIds.push(other.id);
 ship(pf,[parcel([{sku:'SAME',quantity:5}],{complete:true})]);ship(other,[parcel([{sku:'SAME',quantity:7}],{complete:true})]);assert.deepEqual(validatedPFDeliveries(pf,checkout).deliveries[0].items,[{index:0,quantity:2},{index:2,quantity:3}]);assert.deepEqual(validatedPFDeliveries(other,checkout).deliveries[0].items,[{index:1,quantity:7}]);
 pf.shipment.deliveries[0].items[0].quantity=12;assert.equal(validatedPFDeliveries(pf,checkout).deliveries.length,0);
});

for(const mode of ['0','1'])test(`unshipped proof prepayment does not require shipment mapping; actual evidence still does (${mode==='1'?'SQLite':'JSON'})`,()=>isolated(mode,async root=>{
 const {checkout,pf}=fixture();checkout.legal={...checkout.legal,prepayment:true,prepaymentText:'Accepted payment after proof approval, before production.',acceptedAt:'2026-01-01'};checkout.fulfillment.groups=[{}];delete pf.checkoutGroupIndex;pf.status='awaiting_proof';
 await persist(root,checkout,pf);assert.deepEqual(validatedPFDeliveries(pf,checkout),{deliveries:[],problems:[]});let ledger=await reconcileSalesShipments(checkout.id);assert.deepEqual(ledger.problems,[]);assert.deepEqual(ledger.shipments,[]);
 // Absence of shipment claims is different from an invalid actual delivery or
 // a completion flag with no quantity evidence. Those must remain blocked.
 const claimed={...pf,shipment:{isOrderComplete:true,shipDate:'2026-01-02'}};assert.ok(validatedPFDeliveries(claimed,checkout).problems.length);
 assert.ok(validatedPFDeliveries({...pf,pfCancellation:{receivedAt:'2026-01-02'}},checkout).problems.length);
 await changePF(root,pf,p=>ship(p,[parcel([{sku:'SAME',quantity:5}],{complete:true})]));ledger=await reconcileSalesShipments(checkout.id);assert.equal(ledger.shipments.length,0);assert.ok(ledger.problems.some(p=>p.includes('ordrelinjer')));
}));
