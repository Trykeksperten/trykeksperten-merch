import {readdir} from 'node:fs/promises';
import {adminSessionAuthorized,staffSession} from '../admin-auth.mjs';
import {audit,db,databaseEnabled,transaction} from '../backoffice/database.mjs';
import {readCheckout} from '../checkout.mjs';
import {dataPath} from '../data-path.mjs';
import {readLedger} from '../sales-ledger.mjs';
import {readOrder} from '../pf-orders.mjs';
import {accountingDay,accountingDocuments,accountingPeriod,accountingScope,buildAccountingReport,currentAccountingPeriod,eligibleOrder} from './report.mjs';

const companyId='smerch'; // The existing checkout and sales ledgers are single-company.
const checkoutId=/^pay-[a-f0-9-]{36}$/;
const fingerprint=/^[a-f0-9]{64}$/;
const fail=(status,message)=>Object.assign(Error(message),{status});
const basisStatus=r=>({period:r.period,version:r.version,fingerprint:r.fingerprint,
 statementReference:r.statement_reference,reconciledAt:r.reconciled_at,transferStatus:'not_transferred'});
const bases=period=>db().prepare('SELECT period,version,fingerprint,statement_reference,reconciled_at FROM accounting_bases WHERE company_id=? AND period=? ORDER BY version DESC').all(companyId,period);
export function accountingAccess(req){
 if(databaseEnabled()){
  const actor=staffSession(req);
  if(!actor)throw fail(401,'Log ind for at åbne regnskabet.');
  if(actor.companyId!==companyId||!['administrator','accountant'].includes(actor.role))throw fail(403,'Din rolle har ikke adgang til Smerchs regnskab.');
  return {...actor,canReconcile:actor.role==='administrator'};
 }
 if(!adminSessionAuthorized(req))throw fail(401,'Log ind for at åbne regnskabet.');
 return {companyId,role:'administrator',canReconcile:false};
}

async function bankOrderIds(){
 if(databaseEnabled())return db().prepare(`SELECT id FROM records WHERE namespace='checkouts'
 AND json_extract(payload,'$.paymentProvider')='bank_transfer'`).all().map(r=>r.id);
 // Read one checkout at a time in legacy mode. Designs may contain large data URLs.
 try{return (await readdir(dataPath('checkouts'))).filter(n=>checkoutId.test(n.slice(0,-5))&&n.endsWith('.json')).map(n=>n.slice(0,-5));}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}
function relevant(f,inScope){
 const matches=date=>inScope(accountingDay(date));
 return (f.shipments||[]).some(s=>matches(s.shipDate)||!accountingDay(s.shipDate)&&matches(s.createdAt))||
  (f.documents||[]).some(d=>matches(d.date)||!accountingDay(d.date)&&matches(d.registeredAt))||
  (f.payments||[]).some(p=>matches(p.at)||!accountingDay(p.at)&&matches(p.verifiedAt))||
  (f.settlements||[]).some(s=>matches(s.payoutDate)||!accountingDay(s.payoutDate))||
  (f.mail||[]).some(m=>matches(m.paidAt||m.createdAt));
}
async function reportFor(selection){
 const {includes}=accountingScope(selection);
 const ledger=await readLedger();
 const ids=new Set([...Object.keys(ledger.orders).filter(id=>relevant(ledger.orders[id],includes)),...await bankOrderIds()]);
 const sources=[];
 for(const id of ids){
  const f=ledger.orders[id];
  let order;
  try{if(checkoutId.test(id))order=await readCheckout(id);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(!order){if(f)sources.push({orderId:id});continue;}
  if(!eligibleOrder(order))continue;
  if(!f&&order.paymentProvider!=='bank_transfer')continue;
  if(f&&!relevant(f,includes)&&order.paymentProvider!=='bank_transfer')continue;
  const {paymentMode,paymentProvider,paidAt}=order;
  const supplierOrderNumbers=[];
  for(const supplierId of new Set(order.pfOrderIds||[])){
   if(!/^ord-[a-f0-9-]{36}$/.test(supplierId))continue;
   try{
    const supplier=await readOrder(supplierId);
    if(supplier.checkoutId===id&&supplier.pfOrderNumber)supplierOrderNumbers.push(String(supplier.pfOrderNumber));
   }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  sources.push({order:{id,paymentMode,paymentProvider,paidAt,supplierOrderNumbers,
   ...(paymentProvider==='bank_transfer'?{bankPayment:order.bankPayment}:{})},finance:f});
 }
 return buildAccountingReport(selection,sources);
}

export async function accountingOverview(selection,actor){
 const report=await reportFor(selection);
 const {period}=report;
 const versions=period&&databaseEnabled()?bases(period).map(basisStatus):[];
 const latest=versions[0];
 return {report,versions,reconciliationAvailable:actor.canReconcile,periodStatus:!period?null:latest?(latest.fingerprint===report.fingerprint?'reconciled':'changed'):'open',
  canReconcile:Boolean(period)&&actor.canReconcile&&period<currentAccountingPeriod(),accountantAccountsEnabled:actor.role==='administrator'&&databaseEnabled(),
  integration:actor.role==='administrator'?{provider:'e-conomic',status:'not_connected',postingEnabled:false}:undefined};
}
export async function reconcilePeriod(period,input,actor,{now=new Date()}={}){
 accountingPeriod(period);
 if(actor.role==='accountant')throw fail(403,'Bogholderlogin har kun læseadgang til regnskabet.');
 if(!actor.canReconcile||!databaseEnabled())throw fail(409,'Lagring af månedsafstemning kræver det validerede SQLite-arbejdsområde.');
 if(period>=currentAccountingPeriod(now))throw fail(409,'Måneden skal være afsluttet før afstemning.');
 const statement=typeof input?.statementReference==='string'?input.statementReference.trim():'';
 if(!statement||statement.length>200||!fingerprint.test(input?.fingerprint||'')||input?.confirmed!==true||!Number.isSafeInteger(input?.basisVersion)||input.basisVersion<0)throw fail(400,'Angiv afstemningsreference og bekræft gennemgangen.');
 const report=await reportFor(period);
 if(report.fingerprint!==input.fingerprint)throw fail(409,'Rapporten er ændret. Opdatér og gennemgå den igen.');
 if(report.issues.some(i=>i.blocking))throw fail(409,'Datagrundlaget indeholder fejl, som skal afstemmes først.');
 return transaction(()=>{
  const previous=bases(period)[0];
  if(previous?.fingerprint===report.fingerprint){
   if(previous.statement_reference!==statement)throw fail(409,'Rapporten er allerede afstemt med en anden reference.');
   return basisStatus(previous);
  }
  if((previous?.version||0)!==input.basisVersion)throw fail(409,'Der er gemt en nyere afstemning. Opdatér rapporten og prøv igen.');
  const version=input.basisVersion+1,reconciledAt=now.toISOString();
  const snapshot={...report,purpose:'reconciled_source_basis',approvedForPosting:false,
   reconciliation:{version,reconciledAt,statementReference:statement}};
  db().prepare('INSERT INTO accounting_bases VALUES(?,?,?,?,?,?,?,?)').run(companyId,period,version,report.fingerprint,statement,JSON.stringify(snapshot),reconciledAt,actor.id);
  audit(actor,'accounting_period',period,'reconciled',{version,fingerprint:report.fingerprint,statementReference:statement});
  return basisStatus({period,version,fingerprint:report.fingerprint,statement_reference:statement,reconciled_at:reconciledAt});
 });
}
export function readAccountingBasis(period,version){
 accountingPeriod(period);
 if(!databaseEnabled()||!/^[1-9]\d{0,8}$/.test(version||''))throw fail(404,'Afstemningen findes ikke.');
 const row=db().prepare('SELECT snapshot_json FROM accounting_bases WHERE company_id=? AND period=? AND version=?').get(companyId,period,Number(version));
 if(!row)throw fail(404,'Afstemningen findes ikke.');
 return JSON.parse(row.snapshot_json);
}
export async function readAccountingDocument(orderId,id,digest){
 if(!checkoutId.test(orderId||'')||!fingerprint.test(id||'')||!fingerprint.test(digest||''))throw fail(404,'Bilaget findes ikke.');
 let order;
 try{order=await readCheckout(orderId);}catch(error){if(error.code==='ENOENT')throw fail(404,'Bilaget findes ikke.');throw error;}
 const finance=(await readLedger()).orders[orderId];
 if(!eligibleOrder(order)||!finance)throw fail(404,'Bilaget findes ikke.');
 const row=accountingDocuments(order,finance).find(d=>d.id===id&&d.digest===digest);
 if(!row)throw fail(404,'Den viste bilagsversion findes ikke. Opdatér rapporten.');
 return {format:row.format,bytes:row.format==='pdf'?Buffer.from(row.value,'base64'):Buffer.from(row.value)};
}
