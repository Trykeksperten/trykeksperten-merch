import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import nodemailer from 'nodemailer';
import {dataPath} from './data-path.mjs';
import {contactConfiguration} from './contact.mjs';
const pathFor=id=>{if(!/^pay-[a-f0-9-]{36}$/.test(id))throw Error('Invalid order');return dataPath('order-mail',id+'.json');};
async function save(path,data){await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path);}
let sequence=Promise.resolve();
export function queueOrderConfirmation(order){const result=sequence.then(async()=>{
 if(!order.legal?.documents||!['authorized','paid','capture_reconciliation'].includes(order.status))return;
 const path=pathFor(order.id);try{await readFile(path);return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const en=order.legal.locale==='en',amount=(order.totalIncVat/100).toLocaleString(en?'en-GB':'da-DK',{style:'currency',currency:'DKK'});
 const text=[en?'Smerch – order confirmation':'Smerch – ordrebekræftelse',en?'We accept your order on the attached terms.':'Vi accepterer din ordre på de vedhæftede betingelser.',`${en?'Order':'Ordre'}: ${order.id}`,`${en?'Total including VAT and delivery':'I alt inklusive moms og fragt'}: ${amount}`,'',...order.lines.map(line=>`${line.quantity} × ${line.productName||line.productId} · ${line.sku}`),'',`${order.shipping.name}\n${order.shipping.street}\n${order.shipping.postalCode} ${order.shipping.city}\n${order.shipping.country}`,'',order.legal.prepaymentText,order.legal.deliveryTerms||'',en?'Production requires your approval of the final proof. Personalised goods are exempt from withdrawal; statutory rights concerning defects remain unaffected.':'Produktionen kræver din godkendelse af den endelige korrektur. Personligt tilpassede varer er undtaget fra fortrydelse; lovbestemt reklamationsret berøres ikke.','',`Trykeksperten ApS · CVR 44015773\nRaffinaderivej 20, 2300 København S\nhello@smerch.dk · +45 27 82 22 77`].join('\n');
 await save(path,{id:order.id,to:order.shipping.email,locale:order.legal.locale,status:'pending',text,documents:order.legal.documents,createdAt:new Date().toISOString()});
 });sequence=result.catch(()=>{});return result;}
let busy=false;
export async function retryOrderConfirmations({env=process.env,transport}={}){
 const config=contactConfiguration(env);if(busy||!config.ready&&!transport)return;busy=true;
 try{let names;try{names=await readdir(dataPath('order-mail'));}catch(e){if(e.code==='ENOENT')return;throw e;}
 const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
 for(const name of names.filter(x=>/^pay-[a-f0-9-]{36}\.json$/.test(x))){const path=resolve(dataPath('order-mail'),name),record=JSON.parse(await readFile(path,'utf8'));if(record.status==='sent')continue;
  try{await sender.sendMail({from:{name:'Smerch',address:config.user},to:record.to,subject:record.locale==='en'?'Smerch – order confirmation':'Smerch – ordrebekræftelse',text:record.text,attachments:Object.entries(record.documents).map(([key,value])=>({filename:`smerch-${key}-${record.locale}.html`,content:`<!doctype html><html lang="${record.locale}"><meta charset="utf-8"><body>${value.replaceAll('href="/','href="https://smerch.dk/')}</body></html>`,contentType:'text/html; charset=utf-8'}))});record.status='sent';record.sentAt=new Date().toISOString();await save(path,record);}catch{break;}
 }
 }finally{busy=false;}
}
