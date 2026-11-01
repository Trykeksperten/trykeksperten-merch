import {randomUUID} from 'node:crypto';
import {db} from './database.mjs';
import {once} from './operations.mjs';
import {documentTitles} from '../document-types.mjs';

// Admin presentation adds product labels/intake diagnostics. Every persisted
// source field must still match; added presentation fields do not change it.
function matchesSource(source,presented){
 if(source===null||typeof source!=='object')return source===presented;
 if(!presented||typeof presented!=='object'||Array.isArray(source)!==Array.isArray(presented))return false;
 if(Array.isArray(source)&&source.length!==presented.length)return false;
 return Object.keys(source).every(key=>!source[key]&&['productName','color','size'].includes(key)||matchesSource(source[key],presented[key]));
}
export function standalonePFSourceVersion(order){
 const row=db().prepare("SELECT payload,version FROM records WHERE namespace='orders' AND id=?").get(order.id),source=row&&JSON.parse(row.payload);
 if(!source||source.checkoutId||!matchesSource(source,order))throw Error('PF-ordren er ændret. Genindlæs dokumentet.');
 return row.version;
}
export function storeStandalonePFDocument(order,document,input,pdf,sourceVersion){
 return once({id:'system',companyId:'smerch'},input.requestId,'legacy-document:'+order.id,input,()=>{
  if(standalonePFSourceVersion(order)!==sourceVersion)throw Error('PF-ordren er ændret. Genindlæs dokumentet.');
  const id=randomUUID(),at=new Date().toISOString(),version=db().prepare('SELECT coalesce(max(version),0)+1 n FROM pf_documents WHERE pf_order_id=? AND type=?').get(order.id,document.type).n;
  db().prepare('INSERT INTO pf_documents(id,company_id,pf_order_id,type,version,snapshot_json,pdf,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'smerch',order.id,document.type,version,JSON.stringify(document),Buffer.from(pdf),at,'system');
  return {id,version,type:document.type,title:documentTitles[document.type],createdAt:at};
 });
}
