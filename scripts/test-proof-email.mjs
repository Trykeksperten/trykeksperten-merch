import nodemailer from 'nodemailer';
import {proofMailConfiguration,proofMailMessage} from '../lib/proof-mail.mjs';
const [to,...extra]=process.argv.slice(2);
let sender;
try{
 if(extra.length||!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('Brug: node scripts/test-proof-email.mjs modtager-email');
 const config=proofMailConfiguration();if(!config.ready)throw Error('Udfyld PROOF_SMTP_* i Render først.');
 sender=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure,connectionTimeout:15000,socketTimeout:30000});
 await sender.verify();console.log('Korrekturmail: SMTP-login godkendt.');
 const mail=proofMailMessage({to,reference:'TEST',version:1,sentCount:0},config);
 const result=await sender.sendMail({...mail,subject:'[TEST] '+mail.subject,text:'TEST – Dette er kun en test af korrekturmailens afsender og svaradresse. Der er ingen korrektur at godkende, og ingen produktion sættes i gang.\n\n'+mail.text});
 if(!result.accepted?.length||result.rejected?.length)throw Error('Mailserveren accepterede ikke modtageren.');
 console.log('Testmail accepteret. Kontrollér indbakken og at svar går til korrektur@smerch.dk.');
}catch(error){console.error(error.code?`Mailtest fejlede (${String(error.code).replace(/[^A-Z0-9_]/gi,'')}). Kontrollér PROOF_SMTP-indstillinger.`:error.message);process.exitCode=1;}finally{sender?.close();}
