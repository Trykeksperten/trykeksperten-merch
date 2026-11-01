import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,copyFile,symlink,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {runAutomaticBackup,runBackupCommand,privateBackupWorkRoot} from '../lib/automatic-backup.mjs';import {createBackupGate} from '../lib/backup-coordination.mjs';import {verifyBackup,restoreBackup} from '../lib/data-backup.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'smerch-auto-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'data'),workRoot=join(root,'work'),offsite=join(root,'synthetic-offsite'),certificate=join(root,'synthetic-cert.pem'),privateKey=join(root,'synthetic-key.pem');
 await mkdir(source);await mkdir(join(source,'empty'));await mkdir(offsite);await writeFile(join(source,'order.json'),JSON.stringify({revision:1}));await writeFile(join(source,'checkout.json'),JSON.stringify({revision:1}));
 await runBackupCommand('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-subj','/CN=SYNTHETIC-ONLY','-days','1','-keyout',privateKey,'-out',certificate],{timeoutMs:10000});
 const f={root,source,workRoot,certificate,certificateSha256:createHash('sha256').update(await readFile(certificate)).digest('hex'),privateKey,gate:createBackupGate(),environment:{SYNTHETIC_ONLY:'1',PF_GATEWAY_MODE:'test'},saved:null,uploads:0,archive:join(offsite,'cipher.enc')};
 f.saveReceipt=async receipt=>{f.saved=receipt;};f.store={async putAndVerify({path,key,sha256}){
  assert.equal(f.gate.snapshot().paused,false);f.uploads++;await copyFile(path,f.archive);
  const data=await readFile(f.archive);assert.equal(createHash('sha256').update(data).digest('hex'),sha256);
  return {verified:true,verifiedAt:new Date().toISOString(),bucketId:'b'.repeat(24),objectKey:key,fileId:'synthetic-only',bytes:data.length,sha256};
 }};
 return f;
}
test('real snapshot/encryption and isolated restore remain consistent across a pending multi-file write',async t=>{
 const f=await fixture(t),between=deferred(),started=deferred();
 const writer=f.gate.run(async()=>{await writeFile(join(f.source,'order.json'),'{"revision":2}');started.resolve();await between.promise;await writeFile(join(f.source,'checkout.json'),'{"revision":2}');});await started.promise;
 const originalCert=await readFile(f.certificate);const backup=runAutomaticBackup(f);while(!f.gate.snapshot().paused)await new Promise(r=>setImmediate(r));
 await assert.rejects(f.gate.run(()=>writeFile(join(f.source,'must-not-exist'),'bad')),{code:'BACKUP_BUSY'});await writeFile(f.certificate,'CHANGED AFTER CERTIFICATE PREFLIGHT');between.resolve();await writer;
 const receipt=await backup;await writeFile(f.certificate,originalCert);assert.equal(receipt.verified,true);assert.equal(f.saved.sha256,receipt.sha256);assert.equal(f.uploads,1);assert.deepEqual(await readdir(f.workRoot),[]);
 const decoded=join(f.root,'decoded.tgz'),unpacked=join(f.root,'decoded');await mkdir(unpacked);
 await runBackupCommand('openssl',['cms','-decrypt','-binary','-inform','DER','-in',f.archive,'-recip',f.certificate,'-inkey',f.privateKey,'-out',decoded]);
 const extract=String.raw`import pathlib,tarfile,sys
root=pathlib.Path(sys.argv[2]);seen=set();total=0
with tarfile.open(sys.argv[1],'r:gz') as a:
 for m in a:
  p=pathlib.PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!='snapshot' or str(p) in seen or not(m.isdir() or m.isfile()):raise ValueError()
  seen.add(str(p));total+=m.size
  if len(seen)>100 or total>1000000:raise ValueError()
  target=root.joinpath(*p.parts)
  if m.isdir():target.mkdir(mode=0o700,parents=True,exist_ok=True)
  else:
   target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   with target.open('xb') as dst,a.extractfile(m) as src:dst.write(src.read())
`;
 await runBackupCommand('python3',['-c',extract,decoded,unpacked]);const snapshot=join(unpacked,'snapshot/backup');await verifyBackup(snapshot);const restored=join(f.root,'restored');await restoreBackup(snapshot,restored);
 assert.deepEqual(JSON.parse(await readFile(join(restored,'order.json'))),{revision:2});assert.deepEqual(JSON.parse(await readFile(join(restored,'checkout.json'))),{revision:2});
 assert.deepEqual(JSON.parse(await readFile(join(unpacked,'snapshot/environment.json'))),f.environment);assert.deepEqual(f.environment,{SYNTHETIC_ONLY:'1',PF_GATEWAY_MODE:'test'});assert.ok((await readdir(restored)).includes('empty'));
});
test('active data locks, SQLite files, oversize source and invalid certificate abort without upload or success receipt',async t=>{
 for(const kind of ['lock','sqlite','size','certificate']){
  const f=await fixture(t);
  if(kind==='lock')await mkdir(join(f.source,'operation.lock'));
  if(kind==='sqlite')await writeFile(join(f.source,'smerch.sqlite'),'synthetic');
  if(kind==='size')f.maxSourceBytes=1;
  if(kind==='certificate')await writeFile(f.certificate,'NOT A CERTIFICATE');
  await assert.rejects(runAutomaticBackup(f));assert.equal(f.uploads,0);assert.equal(f.saved,null);assert.equal(f.gate.snapshot().paused,false);assert.deepEqual(await readdir(f.workRoot),[]);
 }
});
test('provider or receipt failure leaves the preceding successful receipt and clears local plaintext',async t=>{
 for(const kind of ['provider','receipt']){const f=await fixture(t);const previous={verified:true,version:'old'};f.saved=previous;
  if(kind==='provider')f.store={putAndVerify:async()=>{throw Error('SECRET provider error');}};
  else f.saveReceipt=async()=>{throw Error('disk full');};
  await assert.rejects(runAutomaticBackup(f));assert.equal(f.saved,previous);assert.deepEqual(await readdir(f.workRoot),[]);await f.gate.run(()=>{});
 }
});
test('work directory inside data, including a symlinked parent, is rejected without creating it',async t=>{
 const f=await fixture(t);await assert.rejects(privateBackupWorkRoot(f.source,join(f.source,'new-work')),{code:'BACKUP_PATH_INVALID'});await assert.rejects(access(join(f.source,'new-work')));
 await symlink(f.source,join(f.root,'data-link'));await assert.rejects(privateBackupWorkRoot(f.source,join(f.root,'data-link/new-work')),{code:'BACKUP_PATH_INVALID'});await assert.rejects(access(join(f.source,'new-work')));
});
test('snapshot subprocess is killed at deadline and cannot remain a writer after the gate reopens',async t=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-backup-timeout-'));t.after(()=>rm(root,{recursive:true,force:true}));const pid=join(root,'pid');const gate=createBackupGate();
 await assert.rejects(gate.exclusive(()=>runBackupCommand(process.execPath,['-e',"require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",pid],{timeoutMs:500})),{code:'BACKUP_COMMAND_TIMEOUT'});
 const child=Number(await readFile(pid,'utf8'));assert.throws(()=>process.kill(child,0),{code:'ESRCH'});await gate.run(()=>{});
});

test('wrong recipient fingerprint and a certificate bundle containing a private key are rejected before upload',async t=>{
 const f=await fixture(t);f.certificateSha256='0'.repeat(64);await assert.rejects(runAutomaticBackup(f),{code:'BACKUP_CERTIFICATE_MISMATCH'});assert.equal(f.uploads,0);
 const bundle=Buffer.concat([await readFile(f.certificate),await readFile(f.privateKey)]);await writeFile(f.certificate,bundle);f.certificateSha256=createHash('sha256').update(bundle).digest('hex');await assert.rejects(runAutomaticBackup(f),{code:'BACKUP_CERTIFICATE_MISMATCH'});assert.equal(f.uploads,0);
});
