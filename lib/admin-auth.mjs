import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sessions=new Map();
const attempts=new Map();
const durationMs=8*60*60*1000;
const failureWindowMs=15*60*1000;
const cookieName='smerch_admin';
const now=()=>Date.now();
const equal=(a,b)=>{const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&timingSafeEqual(left,right);};
function currentCredentials(env){
 if(env.NODE_ENV==='production')return env;
 try{const file=readFileSync(new URL('../.env',import.meta.url),'utf8'),local={};for(const key of ['SMERCH_ADMIN_USERNAME','SMERCH_ADMIN_PASSWORD_HASH']){local[key]=new RegExp(`^${key}=([^\r\n]*)$`,'m').exec(file)?.[1];}if(local.SMERCH_ADMIN_USERNAME&&local.SMERCH_ADMIN_PASSWORD_HASH)return {...env,...local};}catch{}
 return env;
}
function passwordValid(password,env){const [salt,hash]=String(env.SMERCH_ADMIN_PASSWORD_HASH||'').split(':');if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hash||'')||typeof password!=='string'||password.length>200)return false;return timingSafeEqual(scryptSync(password,Buffer.from(salt,'hex'),64),Buffer.from(hash,'hex'));}
export function loginAllowed(req){const key=req.socket?.remoteAddress||'unknown',attempt=attempts.get(key);if(!attempt||attempt.until<now()){attempts.delete(key);return true;}return attempt.count<5;}
export function recordLoginFailure(req){const key=req.socket?.remoteAddress||'unknown',current=attempts.get(key);if(!current||current.until<now())attempts.set(key,{count:1,until:now()+failureWindowMs});else current.count++;}
export function createAdminSession(req,res,{username,password},env=process.env){if(!loginAllowed(req))return false;const credentials=env===process.env?currentCredentials(env):env;if(!equal(username,credentials.SMERCH_ADMIN_USERNAME)||!passwordValid(password,credentials)){recordLoginFailure(req);return false;}attempts.delete(req.socket?.remoteAddress||'unknown');const id=randomBytes(32).toString('hex');sessions.set(id,now()+durationMs);res.setHeader('Set-Cookie',`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=${durationMs/1000}${env.NODE_ENV==='production'?'; Secure':''}`);return true;}
function sessionId(req){return /(?:^|;\s*)smerch_admin=([a-f0-9]{64})(?:;|$)/.exec(String(req.headers.cookie||''))?.[1];}
export function adminSessionAuthorized(req){const id=sessionId(req),expires=id&&sessions.get(id);if(!expires)return false;if(expires<now()){sessions.delete(id);return false;}if(!['GET','HEAD'].includes(req.method)){const expected=`http://${req.headers.host}`,origin=req.headers.origin;if(req.headers['x-smerch-admin']!=='1'||origin&&origin!==expected&&origin!==`https://${req.headers.host}`)return false;}return true;}
export function closeAdminSession(req,res){const id=sessionId(req);if(id)sessions.delete(id);res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=0`);}
