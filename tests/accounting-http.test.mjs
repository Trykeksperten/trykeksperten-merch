import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {PDFDocument} from 'pdf-lib';
import {bootstrapAdmin,passwordHash,saveUser} from '../lib/backoffice/security.mjs';
import {closeDatabases,db} from '../lib/backoffice/database.mjs';
import {saveRecord} from '../lib/backoffice/records.mjs';
import {persistCheckout} from '../lib/checkout.mjs';
import {ledgerOrder,readLedger,updateFinance,withLedger} from '../lib/sales-ledger.mjs';

test('accounting HTTP enforces roles and original documents; reconciliation is versioned, audited and replay safe',async t=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-accounting-http-'));
 const keys=['SMERCH_DATA_DIR','SMERCH_DATABASE_ENABLED'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.SMERCH_DATA_DIR=root;
 process.env.SMERCH_DATABASE_ENABLED='1';
 let child;
 t.after(async()=>{
  if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
  closeDatabases();
  for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];
  await rm(root,{recursive:true,force:true});
 });
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
 const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base='http://127.0.0.1:'+port,period='2025-11',password='synthetic-admin-password';
 const credentials={SMERCH_ADMIN_USERNAME:'test-admin',SMERCH_ADMIN_PASSWORD_HASH:passwordHash(password)};
 bootstrapAdmin(credentials);
 const admin={id:'bootstrap-admin',companyId:'smerch',role:'administrator'};
 saveUser(admin,{username:'test-sales',role:'sales',password});
 const orderId='pay-'+randomUUID(),original='Synthetic payment receipt';
 const supplierId='ord-'+randomUUID();
 saveRecord('orders',supplierId,{id:supplierId,checkoutId:orderId,pfOrderNumber:'7911001'});
 await persistCheckout({id:orderId,pfOrderIds:[supplierId],paymentMode:'live',paymentProvider:'quickpay',totalIncVat:12500,shipping:{email:'never-send@example.test'}});
 const payment={type:'capture',id:101,paymentId:202,reference:'qp-9',amount:12500,testMode:false,at:'2025-11-02T12:00:00Z'};
 await withLedger(data=>{
  const f=ledgerOrder(data,orderId);
  f.shipments.push({key:'shipment-1',shipDate:'2025-11-02',net:10000,vat:2500,total:12500});
  f.payments.push(payment);
  f.mail.push({kind:'payment_receipt',key:'receipt:202:101',paymentId:202,operationId:101,paidAt:payment.at,status:'sent',text:original});
 });
 const allocation={reference:'clear-1',bankReference:'bank-1',economicReference:'document-1',gross:12500,refunds:0,fees:200,adjustments:0,held:0,bank:12300};
 const update=settlement=>updateFinance(orderId,{action:'settlement',settlement},{actor:{type:'staff',name:'test-admin'}});
 await update(allocation);
 await assert.rejects(update({...allocation,payoutDate:'2025-02-30'}),/gyldig udbetalingsdato/);
 await update({...allocation,payoutDate:'2025-11-05'});
 await update({...allocation,payoutDate:'2025-11-05'});
 await assert.rejects(update({...allocation,payoutDate:'2025-11-06'}),/andre oplysninger/);
 const finance=(await readLedger()).orders[orderId];
 assert.equal(finance.settlements.length,1);
 assert.equal(finance.events.filter(e=>e.type==='settlement_payout_date_added').length,1);
 const preloader=fileURLToPath(new URL('../scripts/test-local-fetch-only.mjs',import.meta.url));
 child=spawn(process.execPath,['--import',preloader,fileURLToPath(new URL('../server.mjs',import.meta.url))],{
  cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,
   SMERCH_DATABASE_ENABLED:'1',SMERCH_PUBLIC_BASE_URL:base,PF_GATEWAY_MODE:'test',PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0',...credentials},
  stdio:['ignore','pipe','pipe']
 });
 let errors='';child.stderr.on('data',d=>errors+=d);
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed: '+errors);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timed out: '+errors)),10000).unref())]);
 const path='/api/admin/accounting';
 const get=(suffix='',cookie,params={period})=>fetch(base+path+suffix+'?'+new URLSearchParams(params),{headers:cookie?{cookie}:{}});
 const login=async username=>{
  const r=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
  assert.equal(r.status,200);
  return r.headers.get('set-cookie').split(';')[0];
 };
 assert.equal((await get()).status,401);
 const staff=await login('test-admin'),sales=await login('test-sales');
 const createAccountant=async cookie=>fetch(base+'/api/backoffice/users',{
  method:'POST',headers:{cookie,origin:base,'content-type':'application/json','x-smerch-admin':'1','idempotency-key':randomUUID()},
  body:JSON.stringify({username:'test-accountant',role:'accountant',password})
 });
 assert.notEqual((await createAccountant(sales)).status,200);
 const created=await createAccountant(staff);
 assert.equal(created.status,200);
 const accountant=await created.json(),books=await login('test-accountant');
 assert.equal(accountant.role,'accountant');
 for(const path of ['/api/admin/products','/api/admin/invoices/status','/api/admin/marketing']){
  const response=await fetch(base+path,{headers:{cookie:books}});
  assert.ok([401,403].includes(response.status),path);
 }
 assert.equal((await get('/export',sales)).status,403);
 assert.equal((await get('/sales-export')).status,401);
 assert.equal((await get('/sales-export',sales)).status,403);
 assert.equal((await get('/sales-export.pdf')).status,401);
 assert.equal((await get('/sales-export.pdf',sales)).status,403);
 assert.equal((await fetch(base+'/api/backoffice/users',{headers:{cookie:books}})).status,403);
 const overview=async cookie=>{const r=await get('',cookie);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');return r.json();};
 const start=await overview(books);
 assert.equal(start.integration,undefined);
 assert.equal(start.canReconcile,false);
 assert.equal(start.reconciliationAvailable,false);
 for(const resource of ['orders','customers','products','quotes','jobs','files/example','documents/example']){
  assert.equal((await fetch(base+'/api/backoffice/'+resource,{headers:{cookie:books}})).status,403,resource);
 }
 for(const resource of ['orders/example/state','orders/example/payment','orders/example/invoice','orders/example/messages','orders/example/documents','products','customers','users']){
  const response=await fetch(base+'/api/backoffice/'+resource,{method:'POST',headers:{cookie:books,origin:base,'content-type':'application/json','x-smerch-admin':'1','idempotency-key':randomUUID()},body:'{}'});
  assert.equal(response.status,403,resource);
 }
 assert.equal((await overview(staff)).integration.status,'not_connected');
 assert.equal(start.report.totals.payouts,12300);
 assert.equal(start.report.rows.find(row=>row.kind==='capture').orderNumber,'7911001');
 assert.equal(start.periodStatus,'open');
 const exportFile=await get('/export',books);
 assert.match(exportFile.headers.get('content-disposition'),/smerch-regnskab-2025-11\.json/);
 const exported=await exportFile.json();
 assert.equal(exported.fingerprint,start.report.fingerprint);
 assert.equal(exported.approvedForPosting,false);
 const doc=start.report.rows.find(r=>r.kind==='document'),params={order:orderId,id:doc.id,digest:doc.digest};
 const download=await get('/document',books,params);
 assert.match(download.headers.get('content-disposition'),/^attachment/);
 assert.equal(await download.text(),original);
 assert.equal((await get('/document',books,{...params,digest:'0'.repeat(64)})).status,404);
 assert.equal((await get('/document',sales,params)).status,403);
 const post=(body,origin=base,selected=period,cookie=staff)=>fetch(base+path+'/reconcile?period='+selected,{method:'POST',
  headers:{cookie,origin,'content-type':'application/json','x-smerch-admin':'1'},body:JSON.stringify(body)});
 const confirmation={statementReference:'SYN-BANK-11',fingerprint:start.report.fingerprint,basisVersion:0,confirmed:true};
 assert.ok([401,403].includes((await post(confirmation,'https://wrong.example.test')).status));
 assert.equal((await post(confirmation,base,'2099-01')).status,409);
 assert.equal((await post(confirmation,base,period,books)).status,403);
 assert.equal(db().prepare('SELECT count(*) n FROM accounting_bases').get().n,0);
 const first=await post(confirmation);
 assert.equal(first.status,200);
 assert.equal((await first.json()).version,1);
 assert.equal((await post(confirmation)).status,200);
 const before=(await overview(books));
 assert.equal(before.versions.length,1);
 assert.equal(before.periodStatus,'reconciled');
 await withLedger(data=>{ledgerOrder(data,orderId).payments.push({...payment,id:102,type:'refund',amount:500});});
 const next=await overview(books);
 assert.equal(next.periodStatus,'changed');
 assert.equal((await post(confirmation)).status,409);
 const updated={...confirmation,fingerprint:next.report.fingerprint};
 assert.equal((await post(updated)).status,409);
 assert.equal((await post({...updated,basisVersion:1})).status,200);
 const old=await(await get('/basis',books,{period,version:'1'})).json();
 assert.equal(old.approvedForPosting,false);
 assert.equal(old.totals.refunded,0);
 assert.equal((await overview(books)).versions[0].version,2);
 const audited=db().prepare("SELECT actor_id FROM audit WHERE entity_type='accounting_period' ORDER BY rowid").all();
 assert.deepEqual(audited.map(r=>r.actor_id),[admin.id,admin.id]);
 assert.equal(db().prepare('SELECT count(*) n FROM accounting_transfers').get().n,0);

 await withLedger(data=>{
  const f=ledgerOrder(data,orderId);
  f.payments.push({...payment,id:103,type:'refund',amount:250,at:'2025-12-01T22:59:59Z'});
 });
 const dates={from:'2025-11-02',to:'2025-12-01'};
 assert.equal((await get('',undefined,dates)).status,401);
 assert.equal((await get('/export',sales,dates)).status,403);
 assert.equal((await get('',books,{from:dates.from})).status,400);
 assert.equal((await get('',books,{...dates,period})).status,400);
 const rangeResponse=await get('',books,dates);
 assert.equal(rangeResponse.status,200);
 const range=await rangeResponse.json();
 assert.equal(range.report.totals.refunded,750);
 assert.equal(range.report.totals.captured,12500);
 assert.equal(range.report.totals.payouts,12300);
 assert.equal(range.periodStatus,null);
 assert.equal(range.canReconcile,false);
 assert.deepEqual(range.versions,[]);
 assert.equal((await overview(books)).periodStatus,'reconciled');
 const rangeExport=await get('/export',books,dates);
 assert.match(rangeExport.headers.get('content-disposition'),/smerch-regnskab-2025-11-02_til_2025-12-01\.json/);
 const exportedRange=await rangeExport.json();
 assert.equal(exportedRange.fingerprint,range.report.fingerprint);
 assert.equal(exportedRange.from,dates.from);
 assert.equal(exportedRange.to,dates.to);
 assert.equal((await fetch(base+path+'/reconcile?'+new URLSearchParams(dates),{method:'POST',
  headers:{cookie:books,origin:base,'content-type':'application/json','x-smerch-admin':'1'},body:JSON.stringify(confirmation)})).status,400);

 await withLedger(data=>{
  const f=ledgerOrder(data,orderId);
  f.documents.push({id:'credit-1',kind:'credit',original:'invoice-1',date:'2025-12-01',total:50,vat:10});
  f.shipments.push({key:'shipment-2',shipDate:'2025-12-02',net:400,vat:100,total:500});
 });
 const monthCSV=await get('/sales-export',books);
 assert.equal(monthCSV.status,200);
 assert.equal(monthCSV.headers.get('content-type'),'text/csv; charset=utf-8');
 assert.equal(monthCSV.headers.get('cache-control'),'private, no-store');
 assert.equal(monthCSV.headers.get('content-disposition'),'attachment; filename="smerch-omsaetning-2025-11.csv"');
 const csvHeader='\uFEFFDato;Ordrenummer;Type;Ekskl. moms (DKK);Moms (DKK);Inkl. moms (DKK)';
 const sale='2025-11-02;"7911001";Afsendt salg;100,00;25,00;125,00';
 const csvLines=async response=>Buffer.from(await response.arrayBuffer()).toString('utf8').split('\r\n');
 assert.deepEqual(await csvLines(monthCSV),[csvHeader,sale,';;I alt;100,00;25,00;125,00','']);
 const rangeCSV=await get('/sales-export',staff,dates);
 assert.equal(rangeCSV.status,200);
 assert.equal(rangeCSV.headers.get('content-disposition'),'attachment; filename="smerch-omsaetning-2025-11-02_til_2025-12-01.csv"');
 assert.deepEqual(await csvLines(rangeCSV),[csvHeader,sale,'2025-12-01;"7911001";Kreditnota;-0,40;-0,10;-0,50',';;I alt;99,60;24,90;124,50','']);
 assert.equal((await get('/sales-export',books,{...dates,period})).status,400);
 const emptyCSV=await get('/sales-export',books,{period:'2025-10'});
 assert.equal(emptyCSV.status,200);
 assert.deepEqual(await csvLines(emptyCSV),[csvHeader,';;I alt;0,00;0,00;0,00','']);
 for(const [selection,name,title] of [
  [{period},'2025-11','november 2025'],
  [dates,'2025-11-02_til_2025-12-01','02.11.2025 - 01.12.2025'],
  [{period:'2025-10'},'2025-10','oktober 2025']
 ]){
  const response=await get('/sales-export.pdf',books,selection);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('content-disposition'),`attachment; filename="smerch-omsaetning-${name}.pdf"`);
  const pdf=await PDFDocument.load(await response.arrayBuffer());
  assert.equal(pdf.getPageCount(),1);
  assert.equal(pdf.getTitle(),'Omsætningsrapport · '+title);
 }

 await persistCheckout({id:'pay-'+randomUUID(),paymentProvider:'bank_transfer',paymentMode:'live',
  bankPayment:{invoiceNumber:'F-1',receipts:[{at:'2025-11-20',amount:2500,reference:'=TEST()'}]}});
 const reportFile=(report,format,cookie=books,selection={period})=>get('/report-export',cookie,{...selection,report,format});
 assert.equal((await reportFile('quickpay','csv','')).status,401);
 assert.equal((await reportFile('quickpay','pdf',sales)).status,403);
 assert.equal((await reportFile('constructor','csv')).status,400);
 assert.equal((await reportFile('quickpay','html')).status,400);
 assert.equal((await reportFile('quickpay','csv',books,{...dates,period})).status,400);
 for(const [section,expected] of [
  ['overblik',/"Omsætning inkl\. moms";124,50/],
  ['quickpay',/"Refundering";"202";"103";"qp-9";-2,50/],
  ['bankbetalinger',/"F-1";"'=TEST\(\)";25,00/],
  ['clearhaus',/"clear-1";"bank-1";125,00;0,00;2,00;0,00;0,00;123,00/],
  ['udbetalinger',/"clear-1";"bank-1";1;2,00;123,00/],
  ['afregninger-uden-dato',/Ordrenummer;Afregningsreference/],
  ['bilagsoversigt',/"Betalingskvittering";"receipt:202:101";"TXT"/],
  ['datakontrol',/Fejlkode;Blokerer afstemning/]
 ]){
  const response=await reportFile(section,'csv',books,dates);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('content-disposition'),`attachment; filename="smerch-${section}-2025-11-02_til_2025-12-01.csv"`);
  const lines=await csvLines(response);
  assert.match(lines.join('\n'),expected);
  assert.ok(!lines.some(line=>line.includes(original)));
 }
 const monthPayments=(await csvLines(await reportFile('quickpay','csv'))).join('\n');
 assert.match(monthPayments,/"Hævning";"202";"101";"qp-9";125,00/);
 assert.doesNotMatch(monthPayments,/"103"/);
 for(const [section,selection,title] of [
  ['clearhaus',{period},'Clearhaus-afstemning pr. ordre · november 2025'],
  ['quickpay',dates,'Quickpay-betalinger · 2025-11-02 til 2025-12-01'],
  ['bankbetalinger',{period},'Registrerede bankbetalinger · november 2025']
 ]){
  const response=await reportFile(section,'pdf',staff,selection);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/pdf');
  const pdf=await PDFDocument.load(await response.arrayBuffer());
  assert.equal(pdf.getTitle(),title);
  assert.equal(pdf.getPageCount(),1);
 }

 const userAction=(action,cookie,body,origin=base)=>fetch(base+'/api/backoffice/users/'+accountant.id+'/'+action,{
  method:'POST',headers:{cookie,origin,'content-type':'application/json','x-smerch-admin':'1','idempotency-key':randomUUID()},body:JSON.stringify(body)
 });
 const newPassword='synthetic-accountant-password';
 assert.equal((await userAction('password',books,{password:newPassword})).status,403);
 assert.equal((await userAction('password',staff,{password:newPassword},'https://wrong.example.test')).status,401);
 assert.equal((await userAction('password',staff,{password:'too-short'})).status,400);
 assert.equal((await userAction('password',staff,{password:newPassword})).status,200);
 assert.equal((await get('',books)).status,401);
 const accountantLogin=password=>fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test-accountant',password})});
 assert.equal((await accountantLogin(password)).status,401);
 const relogin=await accountantLogin(newPassword);
 assert.equal(relogin.status,200);
 const newCookie=relogin.headers.get('set-cookie').split(';')[0];
 assert.equal((await get('',newCookie)).status,200);
 assert.equal((await userAction('disable',staff,{})).status,200);
 assert.equal((await get('',newCookie)).status,401);
 assert.equal((await accountantLogin(newPassword)).status,401);
 assert.deepEqual(db().prepare("SELECT action FROM audit WHERE entity_type='user' AND entity_id=? ORDER BY rowid").all(accountant.id).map(r=>r.action),['created','password_changed','disabled']);
});
