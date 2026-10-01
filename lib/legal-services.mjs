import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import nodemailer from 'nodemailer';
import {dataPath} from './data-path.mjs';
import {contactConfiguration} from './contact.mjs';
import {MARKETING_VERSION,marketingConsent} from '../dist/legal-consent.mjs';

const clean=(v,n=200)=>typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
const email=v=>{const value=clean(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Skriv en gyldig e-mailadresse. / Enter a valid email.');return value;};
const phone=v=>{let value=clean(v,40).replace(/[\s()-]/g,'');if(/^\d{8}$/.test(value))value='+45'+value;if(!/^\+[1-9]\d{7,14}$/.test(value))throw Error('Skriv telefonnummer med landekode. / Include the country code.');return value;};
async function save(path,value){await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,path);}
async function read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function entries(directory){try{return (await readdir(directory)).filter(x=>x.endsWith('.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
let sequence=Promise.resolve();
function locked(fn){const result=sequence.then(fn);sequence=result.catch(()=>{});return result;}
const target=(channel,address,base)=>resolve(base,'marketing',createHash('sha256').update(channel+':'+address).digest('hex')+'.json');
export function validateMarketing(input){
 const locale=input?.locale==='en'?'en':'da';
 if(input?.version!==MARKETING_VERSION||input?.ownDetails!==true)throw Error('Bekræft dine egne kontaktoplysninger og det aktuelle samtykke. / Confirm your own details and current consent.');
 const channels=['email','sms'].filter(key=>input[key]===true);
 if(!channels.length)throw Error('Vælg e-mail eller SMS. / Select email or SMS.');
 return channels.map(channel=>({channel,address:channel==='email'?email(input.emailAddress):phone(input.phone),text:marketingConsent[locale][channel],locale}));
}
export async function subscribeMarketing(input,{base=dataPath(),now=Date.now()}={}){
 const choices=validateMarketing(input);
 return locked(async()=>{for(const choice of choices){const path=target(choice.channel,choice.address,base),record=await read(path)||{channel:choice.channel,address:choice.address,events:[]};
  record.active=true;record.updatedAt=new Date(now).toISOString();record.events.push({type:'consent',at:record.updatedAt,version:MARKETING_VERSION,text:choice.text,locale:choice.locale,source:'/marketing',ownDetails:true});await save(path,record);
 }return {saved:true};});
}
export async function unsubscribeMarketing(input,{base=dataPath(),now=Date.now()}={}){
 const addresses=[];if(clean(input?.emailAddress))addresses.push(['email',email(input.emailAddress)]);if(clean(input?.phone))addresses.push(['sms',phone(input.phone)]);
 if(!addresses.length)throw Error('Angiv e-mail eller telefon. / Enter email or phone.');
 return locked(async()=>{for(const [channel,address] of addresses){const path=target(channel,address,base),record=await read(path);if(record){record.active=false;record.updatedAt=new Date(now).toISOString();record.events.push({type:'withdrawal',at:record.updatedAt,source:'/marketing?mode=unsubscribe'});await save(path,record);}}return {saved:true};});
}
export async function listMarketing({base=dataPath()}={}){const directory=resolve(base,'marketing');return Promise.all((await entries(directory)).map(name=>read(resolve(directory,name))));}
export function validateWithdrawal(input){
 const result={name:clean(input?.name,120),email:email(input?.email),orderReference:clean(input?.orderReference,160),items:clean(input?.items,1000),locale:input?.locale==='en'?'en':'da'};
 if(!result.name||!result.orderReference||input?.confirmed!==true)throw Error('Udfyld navn og ordreference, og bekræft fortrydelsen. / Enter your name and order reference and confirm withdrawal.');return result;
}
export async function recordWithdrawal(input,{base=dataPath(),now=Date.now()}={}){
 const detail=validateWithdrawal(input),record={id:randomUUID(),...detail,receivedAt:new Date(now).toISOString(),emailStatus:'pending'};
 const en=detail.locale==='en';record.receipt=[en?'Smerch – withdrawal received':'Smerch – fortrydelse modtaget',`ID: ${record.id}`,`${en?'Received (UTC)':'Modtaget (UTC)'}: ${record.receivedAt}`,`${en?'Name':'Navn'}: ${detail.name}`,`E-mail: ${detail.email}`,`${en?'Order':'Ordre'}: ${detail.orderReference}`,`${en?'Goods':'Varer'}: ${detail.items|| (en?'Whole order':'Hele ordren')}`,'',en?'I hereby withdraw from the contract identified above.':'Jeg meddeler hermed, at jeg fortryder den ovenfor angivne aftale.','',en?'Your notice has been received. This receipt does not determine eligibility for withdrawal. Statutory rights and deadlines remain unchanged.':'Din meddelelse er modtaget. Kvitteringen afgør ikke, om købet er omfattet af fortrydelsesret. Lovbestemte rettigheder og frister ændres ikke.','Trykeksperten ApS · CVR 44015773','Raffinaderivej 10e · 2300 København S','hello@smerch.dk · +45 27 82 22 77'].join('\n');
 await save(resolve(base,'withdrawals',record.id+'.json'),record);return record;
}
export async function listWithdrawals({base=dataPath()}={}){const directory=resolve(base,'withdrawals');return Promise.all((await entries(directory)).map(name=>read(resolve(directory,name))));}
export async function deliverWithdrawalReceipt(record,{base=dataPath(),env=process.env,transport}={}){
 const config=contactConfiguration(env);if(!config.ready&&!transport)return false;
 const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
 await sender.sendMail({from:{name:'Smerch',address:config.user},to:record.email,bcc:config.to,subject:record.locale==='en'?'Smerch – withdrawal received':'Smerch – fortrydelse modtaget',text:record.receipt});
 record.emailStatus='sent';record.emailSentAt=new Date().toISOString();await save(resolve(base,'withdrawals',record.id+'.json'),record);return true;
}
let mailing=false;
export async function retryWithdrawalReceipts(){if(mailing||!contactConfiguration().ready)return;mailing=true;try{for(const record of await listWithdrawals())if(record.emailStatus==='pending'){try{await deliverWithdrawalReceipt(record);}catch{break;}}}finally{mailing=false;}}
