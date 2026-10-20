import nodemailer from 'nodemailer';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {contactConfiguration} from '../lib/contact.mjs';
import {loadProductCatalog} from '../lib/pf-catalog-store.mjs';
import {readCheckout} from '../lib/checkout.mjs';
import {queueOrderConfirmation,retryOrderConfirmations} from '../lib/order-mail.mjs';

// Run on the server: node scripts/test-order-email.mjs [test-order-id recipient]
// With no arguments, only verify the SMTP connection. Never process the real mail queue.
const [id,to,...extra]=process.argv.slice(2);
let sender,root;
const previous=process.env.SMERCH_DATA_DIR;
try{
 if(extra.length||Boolean(id)!==Boolean(to)||to&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('Brug: node scripts/test-order-email.mjs [testordre-id modtager-email]');
 const config=contactConfiguration();
 if(!config.ready)throw Error('Mailopsætning mangler. Kontrollér CONTACT_SMTP_* i Render.');
 let order;
 if(id){
  order=await readCheckout(id);
  if(order.adminTest!==true||order.status!=='authorized'||!order.legal?.documents)throw Error('Vælg en godkendt administratortest med vedhæftede betingelser.');
 }
 sender=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure,connectionTimeout:15000,socketTimeout:30000});
 await sender.verify();
 console.log('SMTP-forbindelse og login godkendt.');
 if(order){
  const catalog=await loadProductCatalog(order.lines.map(line=>line.productId));
  order.lines=order.lines.map(line=>({...line,productName:line.productName||catalog.products.find(p=>p.id===line.productId)?.name}));
  root=await mkdtemp(join(tmpdir(),'smerch-mail-test-'));
  process.env.SMERCH_DATA_DIR=root;
  await queueOrderConfirmation({...order,shipping:{...order.shipping,email:to}});
  let delivered=false;
  await retryOrderConfirmations({transport:{sendMail:async message=>{
   const result=await sender.sendMail({...message,subject:'[TEST] '+message.subject,html:'<p><strong>TEST – Dette er en testmail, ikke en bestilling. Ingen produktion eller betaling sættes i gang.</strong></p>'+message.html,text:'TEST – Dette er en testmail, ikke en bestilling. Ingen produktion eller betaling sættes i gang.\n\n'+message.text});
   if(!result.accepted?.length||result.rejected?.length)throw Error('Modtageren blev ikke accepteret af mailserveren.');
   delivered=true;
   return result;
  }}});
  const record=JSON.parse(await readFile(join(root,'order-mail',id+'.json'),'utf8'));
  if(!delivered||record.status!=='sent')throw Error('Testmailen blev ikke accepteret. Kontrollér SMTP-opsætning og modtager.');
  console.log('Testbekræftelsen er accepteret af mailserveren. Kontrollér indbakke/spam samt de to vedhæftninger.');
 }
}catch(error){
 // Avoid printing SMTP responses, credentials or customer data.
 console.error(error.code?`Mailtest fejlede (${String(error.code).replace(/[^A-Z0-9_]/gi,'')}). Kontrollér mailopsætningen.`:error.message);
 process.exitCode=1;
}finally{
 sender?.close();
 if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;
 if(root)await rm(root,{recursive:true,force:true});
}
