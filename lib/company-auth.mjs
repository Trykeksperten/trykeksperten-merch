import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {promisify} from 'node:util';
import {dataPath} from './data-path.mjs';
import {checkoutRequestAuthorized} from './payment-origin.mjs';

const scrypt=promisify(scryptCallback),sessions=new Map(),attempts=new Map();
const duration=8*60*60*1000,windowMs=15*60*1000,cookieName='smerch_company';
const defaults=new URL('../config/companies.json',import.meta.url);
export async function companyAccounts(){
 let source;try{source=await readFile(dataPath('companies.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;source=await readFile(defaults,'utf8');}
 const accounts=JSON.parse(source).accounts;
 if(!Array.isArray(accounts))throw Error('Virksomhedskonti kunne ikke indlæses.');
 return accounts;
}
const address=req=>req.socket?.remoteAddress||'unknown';
const id=req=>/(?:^|;\s*)smerch_company=([a-f0-9]{64})(?:;|$)/.exec(String(req.headers.cookie||''))?.[1];
const cookie=(value,age,env)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=${age}${env.NODE_ENV==='production'?'; Secure':''}`;
export function companyMutationAuthorized(req,env=process.env){return req.headers['x-smerch-company']==='1'&&checkoutRequestAuthorized(req,env);}
export function companyLoginAllowed(req,now=Date.now()){
 const attempt=attempts.get(address(req));return !attempt||attempt.until<=now||attempt.count<5;
}
function prune(now){for(const [key,value]of sessions)if(value.expires<=now)sessions.delete(key);for(const [key,value]of attempts)if(value.until<=now)attempts.delete(key);}
export async function createCompanySession(req,res,input,{env=process.env,accounts,now=Date.now()}={}){
 if(!companyLoginAllowed(req,now))return false;
 prune(now);
 accounts??=await companyAccounts();
 const username=typeof input?.username==='string'?input.username.trim().toLowerCase():'',password=input?.password;
 const account=accounts.find(a=>a.enabled!==false&&a.username===username);
 const [salt,hash]=String((account||accounts[0])?.passwordHash||'').split(':');
 const validFormat=/^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{128}$/.test(hash||'');
 const candidate=validFormat&&typeof password==='string'&&password.length<=200?await scrypt(password,Buffer.from(salt,'hex'),64):null;
 if(!account||!candidate||!timingSafeEqual(candidate,Buffer.from(hash,'hex'))){
  if(attempts.size>=10000)attempts.delete(attempts.keys().next().value);
  const recent=attempts.get(address(req));attempts.set(address(req),{count:(recent?.until>now?recent.count:0)+1,until:recent?.until>now?recent.until:now+windowMs});return false;
 }
 if(sessions.size>=10000)sessions.delete(sessions.keys().next().value);
 attempts.delete(address(req));const token=randomBytes(32).toString('hex');
 sessions.set(token,{accountId:account.id,passwordHash:account.passwordHash,expires:now+duration});
 res.setHeader('Set-Cookie',[cookie(token,duration/1000,env),cookie('',0,env).replace('Path=/api/;', 'Path=/api/company/;')]);return true;
}
export async function companySession(req,{accounts,now=Date.now()}={}){
 const token=id(req),session=token&&sessions.get(token);
 if(!session)return null;
 if(session.expires<=now){sessions.delete(token);return null;}
 accounts??=await companyAccounts();
 const account=accounts.find(a=>a.id===session.accountId&&a.enabled!==false&&a.passwordHash===session.passwordHash);
 if(!account){sessions.delete(token);return null;}
 return {id:account.id,name:account.name};
}
export function closeCompanySession(req,res,env=process.env){const token=id(req);if(token)sessions.delete(token);res.setHeader('Set-Cookie',[cookie('',0,env),cookie('',0,env).replace('Path=/api/;', 'Path=/api/company/;')]);}

let accountWrite=Promise.resolve();
export function configureCompanyAccount(id,input){
 const job=accountWrite.then(async()=>{
  const accounts=await companyAccounts(),account=accounts.find(a=>a.id===id);if(!account)throw Error('Virksomheden findes ikke.');
  const username=String(input.username||'').trim().toLowerCase(),password=input.password;
  if(!/^[a-z0-9@._-]{3,120}$/.test(username)||accounts.some(a=>a.id!==id&&a.username===username))throw Error('Vælg et unikt brugernavn på 3–120 tegn.');
  if(typeof password!=='string'||password.length<8||password.length>200)throw Error('Adgangskoden skal være på 8–200 tegn.');
  const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,Buffer.from(salt,'hex'),64);account.username=username;account.passwordHash=salt+':'+hash.toString('hex');account.enabled=true;
  await mkdir(dataPath(),{recursive:true,mode:0o700});const path=dataPath('companies.json'),temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,JSON.stringify({accounts}),{mode:0o600});await rename(temp,path);return {id:account.id,name:account.name,username:account.username,configured:true};
 });accountWrite=job.catch(()=>{});return job;
}
