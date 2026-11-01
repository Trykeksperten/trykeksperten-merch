import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,mkdtemp,lstat,realpath,writeFile,readFile,chmod,rm,statfs} from 'node:fs/promises';
import {resolve,relative,join,sep,dirname,basename} from 'node:path';
import {createHash,randomUUID,X509Certificate} from 'node:crypto';
const fail=code=>Object.assign(new Error('Backup preparation failed.'),{code});
const inside=(parent,child)=>{const r=relative(parent,child);return !r||r!=='..'&&!r.startsWith('..'+sep)&&!r.startsWith(sep);};
export async function privateBackupWorkRoot(source,workRoot){
 const canonicalSource=await realpath(source),requested=resolve(workRoot);
 // Resolve an existing parent before mkdir, so a symlinked parent cannot cause
 // even a temporary backup directory to be created inside the live data tree.
 const work=join(await realpath(dirname(requested)),basename(requested));
 if(inside(canonicalSource,work)||inside(work,canonicalSource))throw fail('BACKUP_PATH_INVALID');
 try{await mkdir(work,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await lstat(work);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.mode&0o077)throw fail('BACKUP_PATH_INVALID');
 return {source:canonicalSource,work};
}
export async function runBackupCommand(binary,args,{timeoutMs=6000}={}){
 // Never expose environment, stdout, filenames or OpenSSL/provider stderr.
 // Wait for exit after killing: the admission gate must not reopen early.
 await new Promise((resolve,reject)=>{
  let child,settled=false,timedOut=false,commandErrored=false,timer;
  const done=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
  try{child=spawn(binary,args,{env:{PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin'},stdio:'ignore'});}catch{return done(fail('BACKUP_COMMAND_FAILED'));}
  child.once('error',()=>{if(!child.pid)done(fail('BACKUP_COMMAND_FAILED'));else commandErrored=true;});
  child.once('close',code=>done(timedOut?fail('BACKUP_COMMAND_TIMEOUT'):code===0&&!commandErrored?undefined:fail('BACKUP_COMMAND_FAILED')));
  timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
 });
}
const snapshotProgram=String.raw`
import {lstat,readdir} from 'node:fs/promises';import {join} from 'node:path';
import {createBackup,verifyBackup} from ${JSON.stringify(new URL('./data-backup.mjs',import.meta.url).href)};
process.umask(0o077);
const [source,target,limit]=process.argv.slice(1);let total=0,count=0;
async function walk(path,archived=false){for(const item of await readdir(path,{withFileTypes:true})){
 const p=join(path,item.name),s=await lstat(p);if(++count>100000||s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile()))throw Error();
 if(!archived&&(/\.lock$/.test(item.name)||/^smerch\.sqlite(?:-|$)/.test(item.name)))throw Error();
 if(s.isDirectory())await walk(p,archived||(path===source&&['backups','release-backups'].includes(item.name)));
 else{total+=s.size;if(total>Number(limit))throw Error();}
}}
await walk(source);await createBackup(source,target);await verifyBackup(target);
`;
export async function runAutomaticBackup({gate,source,workRoot,certificate,certificateSha256,environment={},sourceCommit=null,store,saveReceipt,now=Date.now,drainTimeoutMs=10000,snapshotTimeoutMs=6000,maxSourceBytes=256*1024*1024,command=runBackupCommand}={}){
 if(!gate?.exclusive||!store?.putAndVerify||typeof saveReceipt!=='function'||!Number.isSafeInteger(maxSourceBytes)||maxSourceBytes<1||maxSourceBytes>256*1024*1024||!Number.isSafeInteger(snapshotTimeoutMs)||snapshotTimeoutMs<1||snapshotTimeoutMs>6000)throw fail('BACKUP_CONFIG_INVALID');
 const {source:canonicalSource,work:canonicalWork}=await privateBackupWorkRoot(source,workRoot);
 const cert=await lstat(certificate);if(!cert.isFile()||cert.isSymbolicLink()||cert.size>65536||!/^[a-f0-9]{64}$/.test(certificateSha256||''))throw fail('BACKUP_CONFIG_INVALID');
 const certificateBytes=await readFile(certificate);
 if(createHash('sha256').update(certificateBytes).digest('hex')!==certificateSha256||/PRIVATE KEY/.test(certificateBytes.toString()))throw fail('BACKUP_CERTIFICATE_MISMATCH');
 let publicKey;try{publicKey=new X509Certificate(certificateBytes).publicKey;}catch{throw fail('BACKUP_CONFIG_INVALID');}
 if(publicKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyDetails?.modulusLength<2048)throw fail('BACKUP_CONFIG_INVALID');
 const disk=await statfs(canonicalWork);if(Number(disk.bavail)*Number(disk.bsize)<maxSourceBytes*3+256*1024*1024)throw fail('BACKUP_DISK_SPACE');
 const task=await mkdtemp(join(canonicalWork,'backup-'));
 try{
  const payload=join(task,'snapshot');await mkdir(payload,{mode:0o700});
  const recipient=join(task,'recipient-cert.pem');await writeFile(recipient,certificateBytes,{flag:'wx',mode:0o600});
  const startedAt=new Date(now()).toISOString();
  await gate.exclusive(()=>command(process.execPath,['--input-type=module','-e',snapshotProgram,canonicalSource,join(payload,'backup'),String(maxSourceBytes)],{timeoutMs:snapshotTimeoutMs}),{drainTimeoutMs});
  const manifest=JSON.parse(await readFile(join(payload,'backup/manifest.json'),'utf8'));
  await writeFile(join(payload,'environment.json'),JSON.stringify(environment),{flag:'wx',mode:0o600});
  await writeFile(join(payload,'recovery-metadata.json'),JSON.stringify({version:1,storage:'json-single-process',snapshotStartedAt:startedAt,snapshotFinishedAt:new Date(now()).toISOString(),sourceCommit:/^[a-f0-9]{40}$/.test(sourceCommit||'')?sourceCommit:null,files:manifest.entries.filter(e=>e.type==='file').length}),{flag:'wx',mode:0o600});
  const archive=join(task,'payload.tgz'),encrypted=join(task,'backup.enc');
  await command('python3',['-c','import tarfile,sys,os;os.umask(0o077);a=tarfile.open(sys.argv[2],"w:gz");a.add(sys.argv[1],arcname="snapshot",recursive=True);a.close()',payload,archive],{timeoutMs:60000});
  await writeFile(encrypted,'',{flag:'wx',mode:0o600});
  await command('openssl',['cms','-encrypt','-binary','-aes-256-cbc','-outform','DER','-in',archive,'-out',encrypted,recipient],{timeoutMs:30000});await chmod(encrypted,0o600);
  const hash=createHash('sha256');for await(const chunk of createReadStream(encrypted))hash.update(chunk);const sha256=hash.digest('hex');
  const key='daily/'+startedAt.slice(0,10)+'/'+randomUUID()+'.enc';
  const receipt=await store.putAndVerify({path:encrypted,key,sha256});
  if(!receipt?.verified||receipt.sha256!==sha256||receipt.objectKey!==key||!Number.isFinite(Date.parse(receipt.verifiedAt)))throw fail('BACKUP_NOT_VERIFIED');
  // A returned provider acknowledgement alone is never a successful backup.
  // The adapter has downloaded the exact immutable version and checked its hash.
  const saved={version:1,...receipt,snapshotStartedAt:startedAt,files:manifest.entries.filter(e=>e.type==='file').length};
  await gate.run(()=>saveReceipt(saved));return saved;
 }finally{await rm(task,{recursive:true,force:true});}
}
