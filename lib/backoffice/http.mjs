import {readRecord} from './records.mjs';
import {owned} from './security.mjs';
import {db,databaseEnabled,databaseHealth} from './database.mjs';
import {staffSession} from '../admin-auth.mjs';
import {saveUser,disableUser,assertPermission} from './security.mjs';
import {once,saveCustomer,listCustomers,saveQuote,quoteTransition,listQuotes,listOrders,orderDetail,registerInvoice,productionTransition,addShipment,saveProduct,listProducts,orderTransition,registerPayment} from './operations.mjs';
import {validateFile,storeFile,addProof,decideProof,readFileForActor} from './files.mjs';
import {documentDraft,checkedDocument,queueDocument,readDocumentForActor,queueMessage} from './jobs.mjs';
const attempts=new Map();
export async function backofficeHTTP(req,res,{readJSON,json}){const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/api/backoffice'))return false;res.setHeader('Cache-Control','private, no-store');if(!databaseEnabled()){json(res,503,{error:'Det nye arbejdsområde afventer valideret databasemigration.'});return true;}const actor=staffSession(req);if(!actor){json(res,401,{error:'Log ind for at fortsætte.'});return true;}const key=actor.id,now=Date.now(),limit=attempts.get(key);if(!limit||limit.until<now){if(attempts.size>10000)attempts.clear();attempts.set(key,{count:1,until:now+60000});}else if(++limit.count>180){json(res,429,{error:'For mange forespørgsler. Vent et øjeblik.'});return true;}try{
 const suffix=path.slice('/api/backoffice'.length).split('/').filter(Boolean).map(decodeURIComponent),[resource,id,action]=suffix;
 if(req.method==='GET'){
 if(resource==='session'){json(res,200,actor);return true;}
 if(resource==='health'){assertPermission(actor,'users');json(res,200,databaseHealth());return true;}
 if(resource==='users'){assertPermission(actor,'users');json(res,200,db().prepare('SELECT id,username,role,enabled,customer_id FROM users WHERE company_id=?').all(actor.companyId));return true;}
 if(resource==='customers'){json(res,200,listCustomers(actor));return true;}
 if(resource==='quotes'){json(res,200,listQuotes(actor));return true;}
 if(resource==='products'){json(res,200,listProducts(actor));return true;}
 if(resource==='orders'){if(action==='mockup'){const order=owned(actor,'orders',id);if(order.source!=='checkout')throw Error('Mockup findes ikke.');const record=readRecord('checkouts',order.source_id),index=Number(new URL(req.url,'http://localhost').searchParams.get('index'));if(!Number.isSafeInteger(index)||index<0)throw Error('Ugyldigt mockup.');const image=record.mockups?.[index];if(!image?.base64)throw Error('Mockup mangler på ordren.');res.writeHead(200,{'Content-Type':'image/png','X-Content-Type-Options':'nosniff'}).end(Buffer.from(image.base64,'base64'));return true;}if(action==='document-draft'){json(res,200,await documentDraft(actor,id,new URL(req.url,'http://localhost').searchParams.get('type')));return true;}json(res,200,id?orderDetail(actor,id):listOrders(actor));return true;}
 if(resource==='files'||resource==='documents'){const row=resource==='files'?readFileForActor(actor,id):readDocumentForActor(actor,id);res.writeHead(200,{'Content-Type':resource==='files'?row.mime_type:'application/pdf','Content-Disposition':`attachment; filename="${resource==='files'?row.name.replace(/[^a-zA-Z0-9._-]/g,'_'):'Smerch-'+row.type+'-v'+row.version+'.pdf'}"`,'Content-Security-Policy':'sandbox','X-Content-Type-Options':'nosniff'}).end(resource==='files'?row.bytes:row.pdf);return true;}
 if(resource==='jobs'){assertPermission(actor,'users');json(res,200,db().prepare('SELECT id,kind,aggregate_id,status,attempts,error_code,created_at FROM jobs WHERE company_id=? ORDER BY created_at DESC LIMIT 100').all(actor.companyId));return true;}
 }
 if(req.method!=='POST')throw Error('Handlingen findes ikke.');const input=await readJSON(req,resource==='orders'&&action==='files'?15*1024*1024:128*1024),requestId=req.headers['idempotency-key'];
 let validated;if(resource==='orders'&&action==='files'){assertPermission(actor,'files');orderDetail(actor,id);validated=await validateFile(input);}if(resource==='orders'&&action==='documents')validated=await checkedDocument(actor,id,input);
 const result=once(actor,requestId,path,input,()=>{
 if(resource==='users')return action==='disable'?disableUser(actor,id):saveUser(actor,input);
 if(resource==='customers')return saveCustomer(actor,input);if(resource==='products')return saveProduct(actor,input);
 if(resource==='quotes')return id?quoteTransition(actor,id,input):saveQuote(actor,input);
 if(resource==='orders'&&id){if(action==='state')return orderTransition(actor,id,input);if(action==='payment')return registerPayment(actor,id,input);if(action==='invoice')return registerInvoice(actor,id,input);if(action==='production')return productionTransition(actor,id,input);if(action==='shipments')return addShipment(actor,id,input);if(action==='files')return storeFile(actor,id,validated);if(action==='proofs')return addProof(actor,id,input);if(action==='proof-decision')return decideProof(actor,id,input);if(action==='documents')return queueDocument(actor,id,validated);if(action==='messages')return queueMessage(actor,id,input);}
 throw Error('Handlingen findes ikke.');});json(res,200,result);
 }catch(e){const known=e.status||(/constraint|SQLITE|database|no such/i.test(e.message)?500:400);json(res,known,{error:known===500?'Handlingen kunne ikke gemmes. Ingen delvis ændring er gemt.':e.message});if(known===500)console.error(JSON.stringify({event:'backoffice_failure',code:'storage_error'}));}return true;}
