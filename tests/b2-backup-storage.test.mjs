import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {createB2BackupStorage} from '../lib/b2-backup-storage.mjs';
const accountId='a'.repeat(12),bucketId='b'.repeat(24),key='daily/2026-11-01/11111111-1111-4111-8111-111111111111.enc',at=Date.parse('2026-11-01T12:00:00Z');
const hash=(b,a='sha256')=>createHash(a).update(b).digest('hex'),json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
async function fixture(t,options={}){
 const root=await mkdtemp(join(tmpdir(),'smerch-b2-client-'));t.after(()=>rm(root,{recursive:true,force:true}));const path=join(root,'synthetic.enc'),bytes=Buffer.from('SYNTHETIC-CIPHER-BYTES-ONLY');await writeFile(path,bytes);
 const state={uploads:0,downloaded:0,files:[],calls:[],...options};
 const fetcher=async(input,init={})=>{
  const url=new URL(input);state.calls.push(url.pathname);
  if(url.pathname.endsWith('b2_authorize_account'))return json({accountId,authorizationToken:'TEST-TOKEN',apiInfo:{storageApi:{apiUrl:state.badAPI||'https://api003.backblazeb2.com',downloadUrl:'https://f003.backblazeb2.com',s3ApiUrl:'https://s3.eu-central-003.backblazeb2.com',allowed:{buckets:[{id:bucketId}],namePrefix:'daily/',capabilities:state.caps||['listFiles','readFiles','writeFiles','readFileRetentions']}}}});
  if(url.pathname.endsWith('b2_list_file_versions')){const body=JSON.parse(init.body);return json({files:[...(body.prefix==='daily/'?(state.budgetFiles||[]):[]),...state.files.filter(f=>f.fileName.startsWith(body.prefix))]});}
  if(url.pathname.endsWith('b2_get_upload_url'))return json({bucketId,uploadUrl:'https://pod003.backblaze.com/b2api/v4/b2_upload_file',authorizationToken:'TEST-UPLOAD'});
  if(url.pathname.endsWith('b2_upload_file')){
   state.uploads++;const chunks=[];for await(const chunk of init.body)chunks.push(chunk);const data=Buffer.concat(chunks);assert.deepEqual(data,bytes);
   const file={bucketId,fileId:'SYNTHETIC-ID',fileName:decodeURIComponent(init.headers['X-Bz-File-Name']),contentLength:data.length,contentSha1:hash(data,'sha1'),fileInfo:{smerch_sha256:hash(data)},action:'upload'};
   if(state.transient&&!state.retried){state.retried=true;if(state.ambiguous)state.files.push(file);return new Response('{}',{status:503});}
   state.files.push(file);return json(file);
  }
  if(url.pathname.endsWith('b2_get_file_info'))return json({...state.files[0],fileRetention:{isClientAuthorizedToRead:true,value:state.retention||{mode:'governance',retainUntilTimestamp:at+30*86400000}}});
  if(url.pathname.endsWith('b2_download_file_by_id')){state.downloaded++;return new Response(state.corrupt?Buffer.from('CORRUPT'):bytes);}
  throw Error('Unexpected test request');
 };
 const storage=createB2BackupStorage({credentials:async()=>({keyId:'TESTKEY',applicationKey:'SYNTHETIC-KEY-NOT-A-CREDENTIAL'}),accountId,bucketId,fetcher,now:()=>at,...(state.clientOptions||{})});
 return {state,run:()=>storage.putAndVerify({path,key,sha256:hash(bytes)}),storage,path,bytes};
}
test('restricted adapter uploads streamed ciphertext and verifies exact retained version by download',async t=>{
 const f=await fixture(t),receipt=await f.run();assert.equal(receipt.verified,true);assert.equal(f.state.uploads,1);assert.equal(f.state.downloaded,1);assert.equal(receipt.bucketId,bucketId);assert.equal(receipt.objectKey,key);assert.equal(receipt.sha256,hash(f.bytes));
});
test('ambiguous 503 after upload is reconciled by unique name without creating a second locked version',async t=>{
 const f=await fixture(t,{transient:true,ambiguous:true});assert.equal((await f.run()).verified,true);assert.equal(f.state.uploads,1);assert.equal(f.state.files.length,1);
});
test('503 with no stored file uses a fresh upload attempt and ends in verified success',async t=>{
 const f=await fixture(t,{transient:true});assert.equal((await f.run()).verified,true);assert.equal(f.state.uploads,2);
});
test('scope with deletion or governance bypass is rejected before upload',async t=>{
 for(const extra of ['deleteFiles','bypassGovernance']){const f=await fixture(t,{caps:['listFiles','readFiles','writeFiles','readFileRetentions',extra]});await assert.rejects(f.run(),{code:'BACKUP_CREDENTIAL_SCOPE'});assert.equal(f.state.uploads,0);}
});
test('non-B2 API destinations cannot receive a credential',async t=>{
 const f=await fixture(t,{badAPI:'https://attacker.example.invalid/'});await assert.rejects(f.run());assert.equal(f.state.calls.length,1);assert.equal(f.state.uploads,0);
});
test('wrong retention and corrupted download never produce verified success',async t=>{
 for(const options of [{retention:{mode:'compliance',retainUntilTimestamp:at+30*86400000}},{retention:{mode:'governance',retainUntilTimestamp:at+86400000}},{corrupt:true}]){const f=await fixture(t,options);await assert.rejects(f.run());}
});
test('storage budget, bad source checksum and size cap fail before upload',async t=>{
 const f=await fixture(t,{budgetFiles:[{bucketId,fileName:'daily/old.enc',contentLength:8_000_000_000,action:'upload'}]});await assert.rejects(f.run(),{code:'BACKUP_STORAGE_BUDGET'});assert.equal(f.state.uploads,0);
 const g=await fixture(t);await assert.rejects(g.storage.putAndVerify({path:g.path,key,sha256:'0'.repeat(64)}));assert.equal(g.state.calls.length,0);
 const h=await fixture(t,{clientOptions:{maxFileBytes:1}});await assert.rejects(h.run(),{code:'BACKUP_SIZE_LIMIT'});assert.equal(h.state.calls.length,0);
});
test('existing conflicting or duplicate versions require reconciliation rather than an overwrite',async t=>{
 const f=await fixture(t);f.state.files=[{bucketId,fileName:key,fileId:'OLD',contentLength:1,contentSha1:'wrong',action:'upload'}];await assert.rejects(f.run());assert.equal(f.state.uploads,0);
 f.state.files.push({...f.state.files[0],fileId:'OTHER'});await assert.rejects(f.run(),{code:'BACKUP_UPLOAD_RECONCILIATION'});assert.equal(f.state.uploads,0);
});
