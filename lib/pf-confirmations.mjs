import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
import {readOrder} from './pf-orders.mjs';
const pathFor=id=>{if(!/^ord-[a-f0-9-]{36}$/.test(id))throw Error('Ugyldig ordre.');return dataPath('pf-confirmations',id+'.json');};
export async function savePFConfirmation(id,input){
 await readOrder(id);
 if(typeof input?.contentBase64!=='string'||input.contentBase64.length>14*1024*1024||(input.contentBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)))throw Error('Vælg en PDF på højst 10 MB.');
 const bytes=Buffer.from(input.contentBase64,'base64');if(bytes.length>10*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Vælg en gyldig PDF på højst 10 MB.');
 const record={name:String(input.name||'pf-ordrebekraeftelse.pdf').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,150),uploadedAt:new Date().toISOString(),contentBase64:bytes.toString('base64')};
 await mkdir(dataPath('pf-confirmations'),{recursive:true,mode:0o700});const dest=pathFor(id),temp=dest+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(record),{mode:0o600});await rename(temp,dest);return {name:record.name,uploadedAt:record.uploadedAt};
}
export async function readPFConfirmation(id){await readOrder(id);return JSON.parse(await readFile(pathFor(id),'utf8'));}
