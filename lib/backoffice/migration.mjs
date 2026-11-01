import {readdir,readFile} from 'node:fs/promises';
import {db,transaction} from './database.mjs';
import {dataPath} from '../data-path.mjs';
import {saveRecord,reconcileStoredPFProjections,reconcileStoredCheckoutPayments} from './records.mjs';
import {supportedDocumentType} from '../document-types.mjs';
import {isDeepStrictEqual} from 'node:util';
import {bindPFDocument} from './pf-document-bindings.mjs';

function validateLegacyDocument(d,name){
 if(!d||d.id+'.json'!==name||!/^ord-[a-f0-9-]{36}$/.test(d.orderId||'')||typeof d.createdAt!=='string'||!Number.isFinite(Date.parse(d.createdAt))||!d.document||typeof d.document!=='object'||Array.isArray(d.document))throw Error('Ugyldigt historisk dokument: '+name);
 if(!supportedDocumentType(d.document.type))throw Error('Ukendt historisk dokumenttype: '+name);
 if(typeof d.pdf!=='string'||!d.pdf||Buffer.from(d.pdf,'base64').toString('base64')!==d.pdf||!Buffer.from(d.pdf,'base64').subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Historisk dokument mangler gyldige PDF-data: '+name);
 return d;
}
async function legacyDocuments(){
 let names=[];try{names=await readdir(dataPath('order-documents'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const documents=[];for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)))documents.push(validateLegacyDocument(JSON.parse(await readFile(dataPath('order-documents',name),'utf8')),name));
 return documents.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
function importDocuments(documents,{standaloneOnly=false}={}){
 for(const d of documents){
  if(db().prepare('SELECT id FROM documents WHERE id=? UNION ALL SELECT id FROM pf_documents WHERE id=?').get(d.id,d.id))continue;
  const record=db().prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(d.orderId),pf=record&&JSON.parse(record.payload);
  if(!pf)throw Error('Historisk dokument mangler sin PF-ordre: '+d.id);
  if(!pf.checkoutId){
   const version=Number.isSafeInteger(d.version)&&d.version>0?d.version:db().prepare('SELECT coalesce(max(version),0)+1 n FROM pf_documents WHERE pf_order_id=? AND type=?').get(pf.id,d.document.type).n;
   db().prepare('INSERT INTO pf_documents(id,company_id,pf_order_id,type,version,snapshot_json,pdf,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(d.id,'smerch',pf.id,d.document.type,version,JSON.stringify(d.document),Buffer.from(d.pdf,'base64'),d.createdAt,'system');
  }else if(!standaloneOnly){
   if(!db().prepare('SELECT id FROM orders WHERE id=?').get(pf.checkoutId))throw Error('Historisk dokument mangler sin kundeordre: '+d.id);
   const version=db().prepare('SELECT coalesce(max(version),0)+1 n FROM documents WHERE order_id=? AND type=?').get(pf.checkoutId,d.document.type).n;
   db().prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)').run(d.id,'smerch',pf.checkoutId,d.document.type,version,JSON.stringify(d.document),Buffer.from(d.pdf,'base64'),d.createdAt,'system');
  }
 }
}
function bindLegacyDocuments(documents){
 for(const d of documents){
  const row=db().prepare('SELECT snapshot_json,pdf FROM documents WHERE id=?').get(d.id);if(!row)continue;
  // A retained JSON record can establish the original PF owner only when it
  // describes the exact immutable document already stored in SQLite.
  if(!row.pdf||!row.pdf.equals(Buffer.from(d.pdf,'base64'))||!isDeepStrictEqual(JSON.parse(row.snapshot_json),d.document))throw Error('Historisk dokument matcher ikke det gemte bilag: '+d.id);
  bindPFDocument(d.id,d.orderId);
 }
}
function repairProjections(){reconcileStoredPFProjections();reconcileStoredCheckoutPayments();}
function markStandaloneDocumentsImported(){db().prepare("INSERT OR IGNORE INTO runtime_metadata(key,value) VALUES('standalone_pf_documents_v1',?)").run(new Date().toISOString());}
function markPFDocumentBindingsImported(){db().prepare("INSERT OR IGNORE INTO runtime_metadata(key,value) VALUES('pf_document_bindings_v1',?)").run(new Date().toISOString());}
export async function importLegacy({dryRun=false}={}){
 if(!dryRun){
  const previous=db().prepare("SELECT value FROM runtime_metadata WHERE key='legacy_import'").get();
  if(previous){
   const needsDocuments=!db().prepare("SELECT value FROM runtime_metadata WHERE key='standalone_pf_documents_v1'").get(),needsBindings=!db().prepare("SELECT value FROM runtime_metadata WHERE key='pf_document_bindings_v1'").get(),documents=needsDocuments||needsBindings?await legacyDocuments():[];
   transaction(()=>{if(needsDocuments){importDocuments(documents,{standaloneOnly:true});markStandaloneDocumentsImported();}if(needsBindings){bindLegacyDocuments(documents);markPFDocumentBindingsImported();}repairProjections();});
   return {...JSON.parse(previous.value),alreadyImported:true};
  }
 }
 const rows=[],counts={checkouts:0,orders:0};
 for(const namespace of ['checkouts','orders']){
  let names;try{names=await readdir(dataPath(namespace));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const name of names.filter(n=>/^(pay|ord)-[a-f0-9-]{36}\.json$/.test(n))){
   const value=JSON.parse(await readFile(dataPath(namespace,name),'utf8'));
   if(value.id+'.json'!==name||!Array.isArray(value.lines))throw Error('Ugyldig historisk ordre: '+name);
   if(value.lines.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0))throw Error('Historisk ordre har ugyldigt antal: '+name);
   rows.push({namespace,value});counts[namespace]++;
  }
 }
 let settings;try{settings=JSON.parse(await readFile(dataPath('document-company.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const documents=await legacyDocuments();counts.documents=documents.length;
 if(!dryRun)transaction(()=>{
  if(settings)db().prepare("UPDATE companies SET settings_json=? WHERE id='smerch' AND settings_json='{}'").run(JSON.stringify(settings));
  for(const {namespace,value} of rows)saveRecord(namespace,value.id,value,{importOnly:true});
  importDocuments(documents);bindLegacyDocuments(documents);markStandaloneDocumentsImported();markPFDocumentBindingsImported();repairProjections();
  db().prepare("INSERT INTO runtime_metadata(key,value) VALUES('legacy_import',?)").run(JSON.stringify({dryRun:false,counts,databaseCheck:'ok'}));
 });
 return {dryRun,counts,databaseCheck:dryRun?null:db().pragma('integrity_check',{simple:true})};
}
