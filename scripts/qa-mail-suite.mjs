import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {applyPFNotification,readOrder} from '../lib/pf-orders.mjs';
import {reconcileShipmentMail,shipmentMailStatus,sendShipmentMail} from '../lib/shipment-mail.mjs';
import {reconcileSalesShipments,financeView,withLedger,updateFinance} from '../lib/sales-ledger.mjs';
import {executeSalesPayment} from '../lib/sales-payments.mjs';
import {queueAccountantBasis,sendFinanceMail} from '../lib/sales-mail.mjs';
import {salesBasis} from '../lib/sales-basis.mjs';
import {processSalesFinance} from '../lib/sales-worker.mjs';
import nodemailer from 'nodemailer';
import {contactConfiguration} from '../lib/contact.mjs';
import {queueOrderConfirmation,releaseOrderConfirmation,retryOrderConfirmations} from '../lib/order-mail.mjs';
import {proofMailConfiguration,proofMailMessage} from '../lib/proof-mail.mjs';
const args=process.argv.slice(2),send=args.includes('--send'),to='joakim@trykeksperten.dk';
if(args.some(a=>!['--send','--dry-run'].includes(a)))throw Error('Use --dry-run or --send');
const originalRoot=process.env.SMERCH_DATA_DIR;
const root=await mkdtemp(join(tmpdir(),'smerch-isolated-mail-suite-'));
process.env.SMERCH_DATA_DIR=root;
const env={SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',QUICKPAY_MODE:'live',QUICKPAY_API_KEY:'mock-only',QUICKPAY_CAPTURE_ENABLED:'1'};
const operation=(id,type,amount)=>({id,type,amount,pending:false,qp_status_code:'20000',created_at:new Date(Date.now()-3600000).toISOString()});
async function fixture(){
 const id='pay-'+randomUUID(),pfId='ord-'+randomUUID(),date=new Date(Date.now()-3600000).toISOString();
 const order={id,paymentProvider:'quickpay',status:'authorized',createdAt:date,quickpayPaymentId:123,quickpayOrderId:randomUUID().slice(0,20),lines:[{productId:'demo',productName:'Demokasket med broderi',sku:'DEMO-CAP',quantity:4,decorations:[{method:'Broderi fixed',position:'Forside'}]}],quote:{net:10000,vat:2500,totalIncVat:12500,lines:[{net:10000,totalIncVat:12500}]},freightExVat:25000,freightIncVat:31250,totalIncVat:43750,legal:{customerType:'business'},billing:{company:'Demokunde ApS',street:'Eksempelvej 1',postalCode:'2300',city:'København S',country:'DK',email:'kunde@example.test',cvr:'12345678',reference:'Demo-reference'},shipping:{name:'Demokunde',company:'Demokunde ApS',street:'Eksempelvej 1',postalCode:'2300',city:'København S',country:'DK',email:'kunde@example.test'},pfOrderIds:[pfId],fulfillment:{groups:[{lineIndexes:[0],kind:'printed'}]},authorizationExpiresAt:new Date(Date.now()+86400000).toISOString(),events:[]};
 await persistCheckout(order);const pf={id:pfId,checkoutId:id,checkoutGroupIndex:0,purchaseOrderNumber:'SMERCH-'+pfId.slice(4),pfOrderNumber:'DEMO-ONLY',status:'processing',createdAt:date,shipping:order.shipping,lines:order.lines,proof:{approvalReference:'DEMO-APPROVED'},events:[]};await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',pfId+'.json'),JSON.stringify(pf));
 const payment={id:123,order_id:order.quickpayOrderId,type:'Payment',currency:'DKK',acquirer:'clearhaus',test_mode:false,accepted:true,link:{amount:43750},operations:[operation(1,'authorize',43750)]};let posts=0;
 const fetchImpl=async(url,options)=>{if(options.method==='POST'){posts++;assert.match(url,/capture$/);const amount=JSON.parse(options.body).amount;payment.operations.push(operation(2,'capture',amount));}return {ok:true,status:200,json:async()=>structuredClone(payment)};};
 return {order,pf,payment,fetchImpl,posts:()=>posts};
}
function notice(pf,{quantity=4,complete=true,tracking=true,reference=true,shipDate=new Date(Date.now()-600000).toISOString(),messageId=randomUUID()}={}){return {ShipmentNotification:{messageId,deliveries:[{deliveryLocation:{customerPONumber:pf.purchaseOrderNumber,carrier:'UPS',shipDate,isOrderComplete:complete,trackAndTrace:tracking?[{trackingId:'DEMO123',trackingURL:'https://tracking.example.test/DEMO123'}]:[],item:[{SKU:'DEMO-CAP',quantity}],...(reference?{reference:{shipmentID:'DEMO-SHIPMENT'}}:{})}}]}};}
async function delivered(f,options={}){const message=notice(f.pf,options);const pf=await applyPFNotification('shipment',message);await reconcileShipmentMail(pf);await reconcileSalesShipments(f.order.id);return {pf,message};}

const messages=[];
const collector={sendMail:async m=>{messages.push(m);return {accepted:[m.to]};}};
let sender,proofSender;
try{
 const f=await fixture();
 f.order.shipping.email=to;f.order.shipping.name='TEST – fiktiv kunde';
 f.order.billing.email=to;
 f.order.legal={customerType:'business',locale:'da',prepaymentText:'Beløbet reserveres ved bestilling og hæves ved afsendelse.',deliveryTerms:'TEST – ingen levering finder sted.',documents:{terms:await readFile(new URL('../dist/legal/terms-da.html',import.meta.url),'utf8'),privacy:await readFile(new URL('../dist/legal/privacy-da.html',import.meta.url),'utf8')}};
 await persistCheckout(f.order);f.pf.shipping=f.order.shipping;
 await writeFile(join(root,'orders',f.pf.id+'.json'),JSON.stringify(f.pf));
 await queueOrderConfirmation(f.order);await releaseOrderConfirmation(f.order.id);await retryOrderConfirmations({transport:collector});
 const pc=proofMailConfiguration(),proofConfig={...pc,user:pc.user||'korrektur@smerch.dk'};
 const proof={id:f.pf.id,to,reference:'TEST-MAIL-20261024',proofReference:'DEMO-PROOF',version:1,sentCount:0,adminTest:true,customerName:'testmodtager',url:'https://smerch.dk/',message:'MAILTEST: Knappen åbner kun Smerchs forside. Der er ingen aktiv korrektur at godkende og ingen produktion. Testen kontrollerer mailens udseende.'};
 messages.push(proofMailMessage(proof,proofConfig));
 messages.push({...proofMailMessage({...proof,version:2,message:proof.message+' Dette viser en revideret korrektur (version 2).'},proofConfig),subject:'Revideret korrektur · version 2'});
 messages.push({...proofMailMessage({...proof,version:2,sentCount:1},proofConfig),subject:'Påmindelse om korrektur · version 2'});
 messages.push(proofMailMessage({...proof,kind:'receipt',version:2,decision:'approve'},proofConfig));
 await delivered(f);
 await executeSalesPayment(f.order.id,{kind:'capture',amount:43750,key:'capture:simulated-mail-test'},{env,fetchImpl:f.fetchImpl});
 const view=await financeView(f.order.id),receipt=view.mail.find(m=>m.kind==='payment_receipt');
 await sendShipmentMail(f.pf.id,(await shipmentMailStatus(f.pf.id))[0].id,{transport:collector});
 await sendFinanceMail(f.order.id,receipt.key,{transport:collector});
 const basis=await queueAccountantBasis(f.order.id,view.shipments[0].key);
 await sendFinanceMail(f.order.id,basis.key,{transport:collector});
 assert.equal(messages.length,8);assert.equal(f.posts(),1);
 const run='mail-suite-20261024-01';
 const banner='TEST – Fiktiv ordre. Ingen varer er bestilt, afsendt eller betalt. Alle beløb, godkendelser og trackingoplysninger nedenfor er simulerede. Fakturagrundlaget må ikke bogføres. Alle testmails går kun til '+to+'.';
 const cc=contactConfiguration();
 const prepared=messages.map((m,i)=>({...m,to,cc:undefined,bcc:undefined,envelope:undefined,replyTo:i>=1&&i<=4?proofConfig.user:cc.user,subject:'[TEST '+(i+1)+'/8] '+m.subject.replace(/^\[TEST\]\s*/,''),messageId:'<'+run+'-'+(i+1)+'@smerch.dk>',text:banner+'\n\n'+m.text,html:m.html?m.html.replace(/<body([^>]*)>/i,'<body$1><p style="padding:16px;color:#a33;font-weight:bold">'+banner+'</p>'):undefined,attachments:m.attachments?.map(a=>({...a,filename:a.cid?a.filename:'TEST-'+a.filename})),disableFileAccess:true,disableUrlAccess:true}));
 if(!send){
  const preview=process.env.SMERCH_MAIL_PREVIEW_DIR||join(tmpdir(),run+'-preview');await mkdir(preview,{recursive:true});
  const stream=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  for(let i=0;i<prepared.length;i++){const m=prepared[i];await writeFile(join(preview,String(i+1)+'.eml'),(await stream.sendMail(m)).message);}
  console.log(JSON.stringify({dryRun:true,count:prepared.length,recipient:to,subjects:prepared.map(m=>m.subject),preview}));
 }else{
  if(!cc.ready||!pc.ready)throw Error('Both SMTP configurations must be ready');
  const make=c=>nodemailer.createTransport({host:c.host,port:c.port,secure:c.secure,auth:{user:c.user,pass:c.password},requireTLS:!c.secure,connectionTimeout:15000,socketTimeout:30000});
  sender=make(cc);proofSender=make(pc);await sender.verify();await proofSender.verify();
  const logDir=join(originalRoot||join(process.cwd(),'.private'),'mail-tests');await mkdir(logDir,{recursive:true,mode:0o700});
  const logPath=join(logDir,run+'.json');
  let rows;try{rows=JSON.parse(await readFile(logPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;rows=[];}
  for(let i=0;i<prepared.length;i++){
   if(rows[i]?.status==='accepted'){console.log(JSON.stringify(rows[i]));continue;}
   if(rows[i])throw Error('Previous send has an uncertain result; reconcile before retry');
   rows[i]={number:i+1,subject:prepared[i].subject,to,status:'sending',at:new Date().toISOString()};await writeFile(logPath,JSON.stringify(rows,null,2),{mode:0o600});
   const result=await (i>=1&&i<=4?proofSender:sender).sendMail(prepared[i]);
   if(!result.accepted?.some(a=>String(a).toLowerCase()===to)||result.rejected?.length)throw Error('SMTP did not accept the single test recipient');
   rows[i].status='accepted';rows[i].messageId=result.messageId;await writeFile(logPath,JSON.stringify(rows,null,2),{mode:0o600});console.log(JSON.stringify(rows[i]));
  }
  console.log('MAIL_SUITE_COMPLETE: 8/8 accepted by SMTP. Inbox delivery requires recipient verification.');
 }
}catch(e){console.error('MAIL_SUITE_FAILED: '+(e.code||e.message));process.exitCode=1;}
finally{sender?.close();proofSender?.close();if(originalRoot===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=originalRoot;await rm(root,{recursive:true,force:true});}
