import nodemailer from 'nodemailer';

const clean=(value,max)=>String(value||'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,max);
const cleanMessage=(value,max)=>String(value||'').trim().replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max);
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const subjects=new Set(['Merchandise','Specialproduktion','Ordre og levering','Andet']);

export function contactConfiguration(env=process.env){
 const host=env.CONTACT_SMTP_HOST||'send.one.com',port=Number(env.CONTACT_SMTP_PORT||465),secure=String(env.CONTACT_SMTP_SECURE??'1')!=='0',user=env.CONTACT_SMTP_USER||'hello@smerch.dk',password=env.CONTACT_SMTP_PASSWORD||'',to=env.CONTACT_TO_EMAIL||'hello@smerch.dk';
 return {host,port,secure,user,password,to,ready:Boolean(host&&Number.isInteger(port)&&port>0&&port<65536&&user&&password&&validEmail(to))};
}

export function sanitizeContact(input={}){
 const inquiry={
  name:clean(input.name,120),company:clean(input.company,160),email:clean(input.email,254).toLowerCase(),phone:clean(input.phone,40),subject:clean(input.subject,80),message:cleanMessage(input.message,4000),website:clean(input.website,200)
 };
 if(!inquiry.name)throw Error('Skriv dit navn.');
 if(!validEmail(inquiry.email))throw Error('Skriv en gyldig e-mailadresse.');
 if(!subjects.has(inquiry.subject))throw Error('Vælg hvad henvendelsen handler om.');
 if(inquiry.message.length<10)throw Error('Skriv lidt mere om dit projekt.');
 return inquiry;
}

const html=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export async function sendContact(inquiry,{env=process.env,transport}={}){
 const config=contactConfiguration(env);
 if(!config.ready)throw Error('Kontaktformularens mailforbindelse er ikke færdigkonfigureret.');
 const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
 const details=[`Navn: ${inquiry.name}`,`Virksomhed: ${inquiry.company||'Ikke angivet'}`,`E-mail: ${inquiry.email}`,`Telefon: ${inquiry.phone||'Ikke angivet'}`,`Emne: ${inquiry.subject}`].join('\n');
 return sender.sendMail({
  from:{name:'Smerch kontaktformular',address:config.user},to:config.to,replyTo:{name:inquiry.name,address:inquiry.email},subject:`Smerch · ${inquiry.subject} · ${inquiry.name}`,
  text:`Ny henvendelse fra smerch.dk\n\n${details}\n\nBesked:\n${inquiry.message}`,
  html:`<h2>Ny henvendelse fra smerch.dk</h2><p><strong>Navn:</strong> ${html(inquiry.name)}<br><strong>Virksomhed:</strong> ${html(inquiry.company||'Ikke angivet')}<br><strong>E-mail:</strong> ${html(inquiry.email)}<br><strong>Telefon:</strong> ${html(inquiry.phone||'Ikke angivet')}<br><strong>Emne:</strong> ${html(inquiry.subject)}</p><p><strong>Besked:</strong></p><p>${html(inquiry.message).replaceAll('\n','<br>')}</p>`
 });
}
