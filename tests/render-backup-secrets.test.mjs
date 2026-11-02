import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,readdir,rm,symlink,unlink,chmod,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {prepareRenderBackupFiles} from '../lib/render-backup-secrets.mjs';
import {backupConfiguration} from '../lib/backup-runtime.mjs';import {runAutomaticBackup,runBackupCommand} from '../lib/automatic-backup.mjs';import {createBackupGate} from '../lib/backup-coordination.mjs';import {verifyBackup,restoreBackup} from '../lib/data-backup.mjs';
const rejected={code:'BACKUP_SECRET_PREPARATION_FAILED'};
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'smerch-render-secret-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const mount=join(root,'mount'),version=join(mount,'..version'),source=join(root,'data'),work=join(root,'work'),privateKey=join(root,'synthetic-private.pem');
 await mkdir(mount);await chmod(mount,0o777);await mkdir(version);await mkdir(source);await writeFile(join(source,'synthetic-order.json'),'{"synthetic":true}');
 const certificate=join(version,'smerch-backup-cert.pem'),credentials=join(version,'smerch-backup-b2.json');
 await runBackupCommand('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-subj','/CN=SYNTHETIC-ONLY','-days','1','-keyout',privateKey,'-out',certificate],{timeoutMs:10000});
 await writeFile(credentials,JSON.stringify({keyId:'syntheticKeyId000001',applicationKey:'syntheticOnlyKey0000+/='}),{mode:0o640});await chmod(certificate,0o640);
 await symlink('..version',join(mount,'..data'));for(const name of ['smerch-backup-cert.pem','smerch-backup-b2.json'])await symlink('..data/'+name,join(mount,name));
 const env={RENDER:'true',RENDER_SERVICE_TYPE:'web',WEB_CONCURRENCY:'1',SMERCH_BACKUP_ENABLED:'1',SMERCH_BACKUP_TRANSFER_APPROVED:'1',SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED:'1',SMERCH_DATA_DIR:source,SMERCH_BACKUP_WORK_DIR:work,SMERCH_BACKUP_CERTIFICATE:join(mount,'smerch-backup-cert.pem'),SMERCH_BACKUP_CREDENTIALS:join(mount,'smerch-backup-b2.json'),SMERCH_BACKUP_CERT_SHA256:createHash('sha256').update(await readFile(certificate)).digest('hex'),SMERCH_BACKUP_B2_ACCOUNT_ID:'a'.repeat(12),SMERCH_BACKUP_B2_BUCKET_ID:'b'.repeat(24),PF_GATEWAY_MODE:'test',UNRELATED_EXISTING_SETTING:'preserve'};
 return {root,mount,version,source,work,privateKey,certificate,credentials,env};
}
async function updateCredentials(f,text){await chmod(f.credentials,0o600);await writeFile(f.credentials,text);await chmod(f.credentials,0o444);}
test('disabled backup returns the same environment and never touches the provider path',async()=>{
 for(const flags of [{},{SMERCH_BACKUP_ENABLED:'0'}]){const env=Object.freeze({...flags,PF_GATEWAY_MODE:'test',SMERCH_BACKUP_CREDENTIALS:'/must-not-read'});const r=await prepareRenderBackupFiles(env,{sourceRoot:'/does-not-exist'});assert.equal(r.environment,env);assert.equal(r.prepared,false);assert.equal(r.directory,null);}
});
test('Render ..data projection becomes separate private regular files and preserves the original inputs',async t=>{
 const f=await fixture(t),before={...f.env},sourceKey=await readFile(f.credentials),result=await prepareRenderBackupFiles(Object.freeze(f.env),{sourceRoot:f.mount});
 assert.equal(result.prepared,true);assert.equal((await lstat(result.directory)).mode&0o777,0o700);assert.deepEqual(f.env,before);assert.equal(result.environment.PF_GATEWAY_MODE,'test');assert.equal(result.environment.UNRELATED_EXISTING_SETTING,'preserve');
 for(const path of [result.environment.SMERCH_BACKUP_CERTIFICATE,result.environment.SMERCH_BACKUP_CREDENTIALS]){const s=await lstat(path);assert.equal(s.isFile(),true);assert.equal(s.isSymbolicLink(),false);assert.equal(s.mode&0o777,0o600);}
 assert.deepEqual(await readFile(result.environment.SMERCH_BACKUP_CREDENTIALS),sourceKey);assert.equal((await lstat(f.env.SMERCH_BACKUP_CREDENTIALS)).isSymbolicLink(),true);assert.deepEqual(await readFile(f.credentials),sourceKey);assert.equal(backupConfiguration(result.environment).enabled,true);
});
test('each preparation uses a fresh directory and preserves earlier copies and unrelated files',async t=>{
 const f=await fixture(t),a=await prepareRenderBackupFiles(f.env,{sourceRoot:f.mount});await writeFile(join(f.work,'keep-me'),'existing work');const b=await prepareRenderBackupFiles(f.env,{sourceRoot:f.mount});assert.notEqual(a.directory,b.directory);assert.deepEqual(await readFile(a.environment.SMERCH_BACKUP_CREDENTIALS),await readFile(b.environment.SMERCH_BACKUP_CREDENTIALS));assert.equal(await readFile(join(f.work,'keep-me'),'utf8'),'existing work');
});
test('a projected source resolving outside the provider mount is rejected without output or modification',async t=>{
 const f=await fixture(t),outside=join(f.root,'outside.json');await writeFile(outside,'DO NOT COPY');await unlink(f.env.SMERCH_BACKUP_CREDENTIALS);await symlink(outside,f.env.SMERCH_BACKUP_CREDENTIALS);await assert.rejects(prepareRenderBackupFiles(f.env,{sourceRoot:f.mount}),rejected);await assert.rejects(lstat(f.work),{code:'ENOENT'});assert.equal(await readFile(outside,'utf8'),'DO NOT COPY');
});
test('a symlink replacing the mount root itself is rejected',async t=>{
 const f=await fixture(t),alias=join(f.root,'alias');await symlink(f.mount,alias);await assert.rejects(prepareRenderBackupFiles({...f.env,SMERCH_BACKUP_CERTIFICATE:join(alias,'smerch-backup-cert.pem'),SMERCH_BACKUP_CREDENTIALS:join(alias,'smerch-backup-b2.json')},{sourceRoot:alias}),rejected);
});
test('a preexisting symlink or publicly accessible work directory is preserved and rejected',async t=>{
 const f=await fixture(t),outside=join(f.root,'outside');await mkdir(outside);await writeFile(join(outside,'keep-me'),'keep');await symlink(outside,f.work);await assert.rejects(prepareRenderBackupFiles(f.env,{sourceRoot:f.mount}),rejected);assert.equal(await readFile(join(outside,'keep-me'),'utf8'),'keep');await unlink(f.work);await mkdir(f.work,{mode:0o755});await assert.rejects(prepareRenderBackupFiles(f.env,{sourceRoot:f.mount}),rejected);assert.deepEqual(await readdir(f.work),[]);
});
test('work inside the live data directory is rejected before writing a credential copy',async t=>{
 const f=await fixture(t);await assert.rejects(prepareRenderBackupFiles({...f.env,SMERCH_BACKUP_WORK_DIR:join(f.source,'forbidden')},{sourceRoot:f.mount}),rejected);assert.deepEqual(await readdir(f.source),['synthetic-order.json']);
});
test('unknown approval flags, non-Render runtime, multiworker and SQLite all fail closed',async t=>{
 const f=await fixture(t);for(const change of [{SMERCH_BACKUP_ENABLED:'true'},{SMERCH_BACKUP_TRANSFER_APPROVED:'0'},{SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED:'0'},{RENDER:'false'},{RENDER_SERVICE_TYPE:'worker'},{WEB_CONCURRENCY:'2'},{SMERCH_DATABASE_ENABLED:'1'}])await assert.rejects(prepareRenderBackupFiles({...f.env,...change},{sourceRoot:f.mount}),rejected);await assert.rejects(lstat(f.work),{code:'ENOENT'});
});
test('arbitrary secret filenames, wrong certificate fingerprint and a private key in place of the certificate are rejected',async t=>{
 const f=await fixture(t);for(const change of [{SMERCH_BACKUP_CREDENTIALS:join(f.mount,'other.json')},{SMERCH_BACKUP_CERT_SHA256:'0'.repeat(64)}])await assert.rejects(prepareRenderBackupFiles({...f.env,...change},{sourceRoot:f.mount}),rejected);
 const key=await readFile(f.privateKey);await chmod(f.certificate,0o600);await writeFile(f.certificate,key);await assert.rejects(prepareRenderBackupFiles({...f.env,SMERCH_BACKUP_CERT_SHA256:createHash('sha256').update(key).digest('hex')},{sourceRoot:f.mount}),rejected);await assert.rejects(lstat(f.work),{code:'ENOENT'});
});
test('malformed, extra-field, non-string and over-budget credential data never appear in errors or copies',async t=>{
 const f=await fixture(t);for(const value of ['SYNTHETIC_SECRET_DO_NOT_LOG',JSON.stringify({keyId:'syntheticKeyId000001',applicationKey:'syntheticOnlyKey0000',extra:'secret'}),JSON.stringify({keyId:123456789012345,applicationKey:'syntheticOnlyKey0000'}),'x'.repeat(4097)]){await updateCredentials(f,value);await assert.rejects(prepareRenderBackupFiles(f.env,{sourceRoot:f.mount}),error=>{assert.equal(error.code,rejected.code);assert.equal(error.message,'Backup secret preparation failed.');assert.equal(error.message.includes(value),false);return true;});}await assert.rejects(lstat(f.work),{code:'ENOENT'});
});
test('the existing automatic backup cycle encrypts and restores synthetic data using the private copy',async t=>{
 const f=await fixture(t),prepared=await prepareRenderBackupFiles(f.env,{sourceRoot:f.mount}),environment=prepared.environment,archive=join(f.root,'synthetic.enc');let saved;const gate=createBackupGate();
 const receipt=await runAutomaticBackup({gate,source:f.source,workRoot:f.work,certificate:environment.SMERCH_BACKUP_CERTIFICATE,certificateSha256:environment.SMERCH_BACKUP_CERT_SHA256,environment:{SYNTHETIC_ONLY:'1',PF_GATEWAY_MODE:'test'},store:{async putAndVerify({path,key,sha256}){await copyFile(path,archive);assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'),sha256);return {verified:true,objectKey:key,sha256,verifiedAt:new Date().toISOString()};}},saveReceipt:async row=>{saved=row;}});
 assert.equal(receipt.verified,true);assert.equal(saved.sha256,receipt.sha256);assert.deepEqual(await readdir(f.work),[prepared.directory.split('/').at(-1)]);
 const decoded=join(f.root,'decoded.tgz'),unpacked=join(f.root,'unpacked');await mkdir(unpacked);await runBackupCommand('openssl',['cms','-decrypt','-binary','-inform','DER','-in',archive,'-recip',environment.SMERCH_BACKUP_CERTIFICATE,'-inkey',f.privateKey,'-out',decoded]);
 await runBackupCommand('python3',['-c','import tarfile,sys,pathlib; a=tarfile.open(sys.argv[1],"r:gz"); assert all((m.isfile() or m.isdir()) and not pathlib.PurePosixPath(m.name).is_absolute() and ".." not in pathlib.PurePosixPath(m.name).parts for m in a.getmembers()); a.extractall(sys.argv[2])',decoded,unpacked]);const manifest=await verifyBackup(join(unpacked,'snapshot/backup'));assert.equal(manifest.entries.filter(x=>x.type==='file').length,1);const restored=join(f.root,'restored');await restoreBackup(join(unpacked,'snapshot/backup'),restored);assert.equal(await readFile(join(restored,'synthetic-order.json'),'utf8'),'{"synthetic":true}');assert.deepEqual(JSON.parse(await readFile(join(unpacked,'snapshot/environment.json'),'utf8')),{SYNTHETIC_ONLY:'1',PF_GATEWAY_MODE:'test'});
});
test('the startup wrapper starts exactly one synthetic server when backup is disabled',async t=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-wrapper-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'scripts'));await mkdir(join(root,'lib'));
 await copyFile(new URL('../scripts/start-server.mjs',import.meta.url),join(root,'scripts/start-server.mjs'));await copyFile(new URL('../lib/render-backup-secrets.mjs',import.meta.url),join(root,'lib/render-backup-secrets.mjs'));await copyFile(new URL('../lib/automatic-backup.mjs',import.meta.url),join(root,'lib/automatic-backup.mjs'));
 await writeFile(join(root,'server.mjs'),'console.log(JSON.stringify({syntheticServerStarts:1,pfMode:process.env.PF_GATEWAY_MODE,backup:process.env.SMERCH_BACKUP_ENABLED}));');
 const run=spawnSync(process.execPath,[join(root,'scripts/start-server.mjs')],{cwd:root,env:{PATH:process.env.PATH,PF_GATEWAY_MODE:'test',SMERCH_BACKUP_ENABLED:'0'},encoding:'utf8',timeout:10000});assert.equal(run.status,0);assert.deepEqual(JSON.parse(run.stdout),{syntheticServerStarts:1,pfMode:'test',backup:'0'});assert.equal(run.stderr,'');
 await writeFile(join(root,'.env'),'SMERCH_BACKUP_ENABLED=1\n');const fail=spawnSync(process.execPath,[join(root,'scripts/start-server.mjs')],{cwd:root,env:{PATH:process.env.PATH,PF_GATEWAY_MODE:'test'},encoding:'utf8',timeout:10000});assert.equal(fail.status,1);assert.equal(fail.stdout,'');assert.deepEqual(JSON.parse(fail.stderr),{event:'backup_secret_preparation_failed',code:'BACKUP_SECRET_PREPARATION_FAILED'});
});
