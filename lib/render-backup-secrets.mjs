// Candidate only: copy a trusted Render projection into fresh private regular files.
import {constants} from 'node:fs';
import {lstat,realpath,open,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {isAbsolute,resolve,relative,sep,join} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import {privateBackupWorkRoot} from './automatic-backup.mjs';
const invalid=()=>Object.assign(Error('Backup secret preparation failed.'),{code:'BACKUP_SECRET_PREPARATION_FAILED'});
const inside=(parent,path)=>{const r=relative(parent,path);return r!==''&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function readProjected(mount,path,maxBytes){
 const canonical=await realpath(path);
 if(!inside(mount,canonical))throw invalid();
 const before=await lstat(canonical);
 if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>maxBytes)throw invalid();
 const handle=await open(canonical,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await handle.stat();
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino)throw invalid();
  const bytes=Buffer.alloc(maxBytes+1);let length=0;
  while(length<bytes.length){const r=await handle.read(bytes,length,bytes.length-length,null);if(!r.bytesRead)break;length+=r.bytesRead;}
  const after=await handle.stat();
  if(length<1||length>maxBytes||after.size!==length||before.size!==after.size||before.mtimeMs!==after.mtimeMs||await realpath(path)!==canonical)throw invalid();
  return bytes.subarray(0,length);
 }finally{await handle.close();}
}
export async function prepareRenderBackupFiles(env,{sourceRoot='/etc/secrets'}={}){
 if(env.SMERCH_BACKUP_ENABLED===undefined||env.SMERCH_BACKUP_ENABLED==='0')return {environment:env,prepared:false,directory:null};
 let ownDirectory;
 try{
  if(env.SMERCH_BACKUP_ENABLED!=='1'||env.SMERCH_BACKUP_TRANSFER_APPROVED!=='1'||env.SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED!=='1'||env.RENDER!=='true'||env.RENDER_SERVICE_TYPE!=='web'||env.WEB_CONCURRENCY!=='1'||env.SMERCH_DATABASE_ENABLED==='1')throw invalid();
  if(!isAbsolute(sourceRoot)||!isAbsolute(env.SMERCH_DATA_DIR||'')||!isAbsolute(env.SMERCH_BACKUP_WORK_DIR||'')||! /^[a-f0-9]{64}$/.test(env.SMERCH_BACKUP_CERT_SHA256||''))throw invalid();
  const requestedMount=resolve(sourceRoot),mountStat=await lstat(requestedMount);
  if(!mountStat.isDirectory()||mountStat.isSymbolicLink())throw invalid();
  const mount=await realpath(requestedMount),certSource=join(requestedMount,'smerch-backup-cert.pem'),keySource=join(requestedMount,'smerch-backup-b2.json');
  if(env.SMERCH_BACKUP_CERTIFICATE!==certSource||env.SMERCH_BACKUP_CREDENTIALS!==keySource)throw invalid();
  const certificate=await readProjected(mount,certSource,65536),credentials=await readProjected(mount,keySource,4096);
  if(createHash('sha256').update(certificate).digest('hex')!==env.SMERCH_BACKUP_CERT_SHA256||certificate.includes(Buffer.from('PRIVATE KEY')))throw invalid();
  const publicKey=new X509Certificate(certificate).publicKey;
  if(publicKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyDetails?.modulusLength<2048)throw invalid();
  const key=JSON.parse(credentials.toString('utf8'));
  if(!key||typeof key.keyId!=='string'||typeof key.applicationKey!=='string'||Object.keys(key).sort().join(',')!=='applicationKey,keyId'||! /^[a-zA-Z0-9]{15,80}$/.test(key.keyId||'')||! /^[a-zA-Z0-9/+_=-]{15,100}$/.test(key.applicationKey||''))throw invalid();
  const {work}=await privateBackupWorkRoot(env.SMERCH_DATA_DIR,env.SMERCH_BACKUP_WORK_DIR);
  ownDirectory=await mkdtemp(join(work,'credentials-'));
  const certificatePath=join(ownDirectory,'certificate.pem'),credentialsPath=join(ownDirectory,'credentials.json');
  await writeFile(certificatePath,certificate,{flag:'wx',mode:0o600});
  await writeFile(credentialsPath,credentials,{flag:'wx',mode:0o600});
  for(const path of [certificatePath,credentialsPath]){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.mode&0o077)throw invalid();}
  return {prepared:true,directory:ownDirectory,environment:{...env,SMERCH_BACKUP_CERTIFICATE:certificatePath,SMERCH_BACKUP_CREDENTIALS:credentialsPath}};
 }catch{
  if(ownDirectory)await rm(ownDirectory,{recursive:true,force:true});
  throw invalid();
 }
}
