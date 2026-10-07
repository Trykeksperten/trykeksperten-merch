import {sanitizeContact,sendContact} from './contact.mjs';

const maxFileSize=5*1024*1024;
export function sanitizeSpecial(input={}){
 const customerTypes={private:'Privatperson',business:'Virksomhed',association:'Forening'};
 if(!Object.hasOwn(customerTypes,input.customerType))throw Error('Vælg kundetype.');
 if(!Number.isSafeInteger(Number(input.quantity))||Number(input.quantity)<1)throw Error('Angiv et gyldigt antal.');
 const inquiry=sanitizeContact({...input,subject:'Specialproduktion',message:input.description});
 const optional=[['budget','Samlet budget i kr.'],['deadline','Ønsket leveringsdato'],['reference','Link til inspiration']];
 inquiry.message=[`Kundetype: ${customerTypes[input.customerType]}`,`Ønsket antal: ${Number(input.quantity)}`,...optional.filter(([key])=>input[key]).map(([key,label])=>`${label}: ${String(input[key]).replace(/[\r\n]/g,' ').slice(0,500)}`),'',inquiry.message].join('\n');
 const files=input.attachments??[];
 if(!Array.isArray(files)||files.length>3)throw Error('Vælg højst 3 filer.');
 inquiry.attachments=files.map(file=>{
  if(!file||typeof file.data!=='string'||file.data.length>4*Math.ceil(maxFileSize/3)||!file.data.length||file.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw Error('Bilaget er ugyldigt eller for stort.');
  const content=Buffer.from(file.data,'base64');
  if(content.length>maxFileSize||content.toString('base64')!==file.data)throw Error('Hver fil må højst fylde 5 MB og skal være gyldig.');
  const valid=file.type==='image/png'?content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):file.type==='image/jpeg'?content[0]===255&&content[1]===216&&content[2]===255:file.type==='application/pdf'?content.subarray(0,5).toString()==='%PDF-':false;
  if(!valid)throw Error('Vælg gyldige PNG-, JPG- eller PDF-filer.');
  const filename=String(file.name||'bilag').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160)||'bilag';
  return {filename,content,contentType:file.type};
 });
 return inquiry;
}
export function sendSpecial(inquiry,{env=process.env,transport}={}){
 return sendContact(inquiry,{env:{...env,CONTACT_TO_EMAIL:'hello@smerch.dk'},transport,attachments:inquiry.attachments});
}
