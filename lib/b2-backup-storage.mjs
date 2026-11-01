import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fail=(code='B2_BACKUP_FAILED')=>Object.assign(new Error('External backup verification failed.'),{code});
const validHost=url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!['.backblazeb2.com','.backblaze.com'].some(s=>u.hostname.endsWith(s)))throw fail();return u.href;};
async function smallJSON(response){
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw fail();chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail();}
}
async function digest(path,maxBytes){
 const stat=await lstat(path);if(!stat.isFile()||stat.size<1||stat.size>maxBytes)throw fail('BACKUP_SIZE_LIMIT');
 const sha256=createHash('sha256'),sha1=createHash('sha1');let bytes=0;
 for await(const chunk of createReadStream(path)){bytes+=chunk.length;if(bytes>maxBytes)throw fail('BACKUP_SIZE_LIMIT');sha256.update(chunk);sha1.update(chunk);}
 if(bytes!==stat.size)throw fail();return {bytes,sha256:sha256.digest('hex'),sha1:sha1.digest('hex')};
}
export function createB2BackupStorage({credentials,accountId,bucketId,region='eu-central-003',prefix='daily/',fetcher=globalThis.fetch,now=Date.now,maxFileBytes=200*1024*1024,maxStoredBytes=8_000_000_000,attempts=3}={}){
 if(typeof credentials!=='function'||typeof fetcher!=='function'||!/^[a-f0-9]{12}$/.test(accountId||'')||!/^[a-f0-9]{24}$/.test(bucketId||'')||region!=='eu-central-003'||prefix!=='daily/'||!Number.isSafeInteger(maxFileBytes)||maxFileBytes<1||maxFileBytes>200*1024*1024||!Number.isSafeInteger(maxStoredBytes)||maxStoredBytes<maxFileBytes||maxStoredBytes>8_000_000_000||!Number.isInteger(attempts)||attempts<1||attempts>3)throw fail('BACKUP_CONFIG_INVALID');
 async function request(url,options={}){try{return await fetcher(validHost(url),{...options,redirect:'error',signal:AbortSignal.timeout(30_000)});}catch{throw fail();}}
 async function authorize(){
  const key=await credentials();if(!/^[A-Za-z0-9]+$/.test(key?.keyId||'')||typeof key?.applicationKey!=='string'||key.applicationKey.length<20)throw fail('BACKUP_CONFIG_INVALID');
  const response=await request('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(key.keyId+':'+key.applicationKey).toString('base64')}});
  if(!response.ok)throw fail();const auth=await smallJSON(response),storage=auth.apiInfo?.storageApi,allowed=storage?.allowed;
  const caps=new Set(allowed?.capabilities),expected=new Set(['listFiles','readFiles','writeFiles','readFileRetentions']);
  if(auth.accountId!==accountId||storage?.s3ApiUrl!==`https://s3.${region}.backblazeb2.com`||allowed?.buckets?.length!==1||allowed.buckets[0].id!==bucketId||allowed.namePrefix!==prefix||caps.size!==expected.size||![...expected].every(c=>caps.has(c)))throw fail('BACKUP_CREDENTIAL_SCOPE');
  validHost(storage.apiUrl);validHost(storage.downloadUrl);return {token:auth.authorizationToken,...storage};
 }
 async function call(auth,action,body){
  const response=await request(auth.apiUrl+'/b2api/v4/'+action,{method:'POST',headers:{Authorization:auth.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw fail();return smallJSON(response);
 }
 async function versions(auth,name){
  const result=await call(auth,'b2_list_file_versions',{bucketId,prefix:name,maxFileCount:1000});
  if(!Array.isArray(result.files)||result.nextFileId||result.nextFileName)throw fail('BACKUP_STORAGE_BUDGET');
  if(result.files.some(f=>f.bucketId!==bucketId||typeof f.fileName!=='string'||!f.fileName.startsWith(name)||!Number.isSafeInteger(f.contentLength)||f.contentLength<0))throw fail();
  return result.files;
 }
 async function verify(auth,file,key,expected){
  if(file.bucketId!==bucketId||file.fileName!==key||file.contentLength!==expected.bytes||file.contentSha1!==expected.sha1||file.fileInfo?.smerch_sha256!==expected.sha256||typeof file.fileId!=='string'||!file.fileId)throw fail();
  const info=await call(auth,'b2_get_file_info',{fileId:file.fileId}),lock=info.fileRetention;
  if(info.fileId!==file.fileId||info.bucketId!==bucketId||info.fileName!==key||info.contentLength!==expected.bytes||!lock?.isClientAuthorizedToRead||lock.value?.mode!=='governance'||lock.value.retainUntilTimestamp<now()+29*86400000||lock.value.retainUntilTimestamp>now()+31*86400000)throw fail('BACKUP_RETENTION_INVALID');
  const response=await request(auth.downloadUrl+'/b2api/v4/b2_download_file_by_id?fileId='+encodeURIComponent(file.fileId),{headers:{Authorization:auth.token}});if(!response.ok)throw fail();
  const hash=createHash('sha256');let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>expected.bytes)throw fail();hash.update(chunk);}
  if(bytes!==expected.bytes||hash.digest('hex')!==expected.sha256)throw fail();
  return {verified:true,verifiedAt:new Date(now()).toISOString(),bucketId,fileId:file.fileId,objectKey:key,bytes,sha256:expected.sha256,retainUntil:new Date(lock.value.retainUntilTimestamp).toISOString()};
 }
 return {async putAndVerify({path,key,sha256}){
  if(!/^daily\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.enc$/.test(key||'')||!/^[a-f0-9]{64}$/.test(sha256||''))throw fail('BACKUP_CONFIG_INVALID');
  const expected=await digest(path,maxFileBytes);if(expected.sha256!==sha256)throw fail();
  const auth=await authorize(),all=await versions(auth,prefix);
  const stored=all.reduce((n,f)=>n+f.contentLength,0);if(!Number.isSafeInteger(stored)||stored+expected.bytes>maxStoredBytes)throw fail('BACKUP_STORAGE_BUDGET');
  for(let attempt=0;attempt<attempts;attempt++){
   // A lost response is ambiguous. Reconcile the unique object name before
   // retrying; never blindly create another billable, locked version.
   const matches=(await versions(auth,key)).filter(f=>f.action==='upload'&&f.fileName===key);
   if(matches.length>1)throw fail('BACKUP_UPLOAD_RECONCILIATION');if(matches.length)return verify(auth,matches[0],key,expected);
   const upload=await call(auth,'b2_get_upload_url',{bucketId});if(upload.bucketId!==bucketId)throw fail();
   const stream=createReadStream(path);let response;
   try{response=await request(upload.uploadUrl,{method:'POST',duplex:'half',headers:{Authorization:upload.authorizationToken,'Content-Type':'application/octet-stream','Content-Length':String(expected.bytes),'X-Bz-File-Name':encodeURIComponent(key),'X-Bz-Content-Sha1':expected.sha1,'X-Bz-Info-smerch_sha256':expected.sha256},body:stream});}
   catch{continue;}finally{stream.destroy();}
   if(response.ok)return verify(auth,await smallJSON(response),key,expected);
   if(![500,502,503,504].includes(response.status))throw fail();await response.body?.cancel();
  }
  const matches=(await versions(auth,key)).filter(f=>f.action==='upload'&&f.fileName===key);
  if(matches.length===1)return verify(auth,matches[0],key,expected);throw fail('BACKUP_UPLOAD_RECONCILIATION');
 }};
}
