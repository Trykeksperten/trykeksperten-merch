import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,scryptSync} from 'node:crypto';
import {createCompanySession,companySession,closeCompanySession,companyLoginAllowed,companyMutationAuthorized} from '../lib/company-auth.mjs';
import {adminSessionAuthorized} from '../lib/admin-auth.mjs';
const salt=randomBytes(16).toString('hex'),password='test-customer-password',accounts=[{id:'customer-a',username:'customer-a',name:'Customer A',passwordHash:salt+':'+scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex')}];
const request=(address='company-test')=>({socket:{remoteAddress:address},method:'GET',headers:{host:'shop.example',origin:'https://shop.example','x-smerch-company':'1'}});
const env={NODE_ENV:'production',SMERCH_PUBLIC_BASE_URL:'https://api.example',SMERCH_CUSTOMER_BASE_URL:'https://shop.example'};
test('company sessions are isolated from staff sessions, expire and revoke on logout or credential change',async()=>{
 const req=request(),headers={},res={setHeader:(k,v)=>headers[k]=v},now=1000;
 assert.equal(await createCompanySession(req,res,{username:'customer-a',password},{accounts,now,env}),true);
 assert.match(headers['Set-Cookie'][0],/HttpOnly; SameSite=Strict; Path=\/api\//);assert.match(headers['Set-Cookie'][0],/; Secure$/);
 req.headers.cookie=headers['Set-Cookie'][0].split(';')[0];
 assert.deepEqual(await companySession(req,{accounts,now}),{id:'customer-a',name:'Customer A'});
 assert.equal(adminSessionAuthorized(req),false);
 assert.equal(companyMutationAuthorized(req,env),true);
 assert.equal(companyMutationAuthorized({...req,headers:{...req.headers,origin:'https://evil.example'}},env),false);
 assert.equal(companyMutationAuthorized({...req,headers:{...req.headers,'x-smerch-company':undefined}},env),false);
 closeCompanySession(req,res,env);assert.equal(await companySession(req,{accounts,now}),null);
 await createCompanySession(req,res,{username:'customer-a',password},{accounts,now,env});req.headers.cookie=headers['Set-Cookie'][0].split(';')[0];
 assert.equal(await companySession(req,{accounts,now:now+9*3600000}),null);
 await createCompanySession(req,res,{username:'customer-a',password},{accounts,now,env});req.headers.cookie=headers['Set-Cookie'][0].split(';')[0];
 assert.equal(await companySession(req,{accounts:[{...accounts[0],enabled:false}],now}),null);
});
test('invalid company credentials are rate limited and do not create a session',async()=>{
 const req=request('company-failure-test'),res={setHeader:()=>assert.fail('No cookie expected')};
 for(let i=0;i<5;i++)assert.equal(await createCompanySession(req,res,{username:'customer-a',password:'wrong'},{accounts,now:1000}),false);
 assert.equal(companyLoginAllowed(req,1001),false);assert.equal(await createCompanySession(req,res,{username:'customer-a',password},{accounts,now:1001}),false);
 assert.equal(companyLoginAllowed(req,1000+16*60000),true);
});

test('staff-managed credentials are hashed in private storage and changing them revokes earlier company sessions',async()=>{
 const {mkdtemp,readFile,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {configureCompanyAccount,companyAccounts}=await import('../lib/company-auth.mjs');
 const directory=await mkdtemp(join(tmpdir(),'smerch-company-account-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=directory;
 try{
  await writeFile(join(directory,'companies.json'),JSON.stringify({accounts:[{id:'racketclub',name:'Test fixture'}]}));
  await configureCompanyAccount('racketclub',{username:'test-company',password:'private-test-password'});
  const text=await readFile(join(directory,'companies.json'),'utf8');assert.ok(!text.includes('private-test-password'));assert.match(JSON.parse(text).accounts[0].passwordHash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  const headers={},res={setHeader:(k,v)=>headers[k]=v},req=request('private-config-test');
  assert.equal(await createCompanySession(req,res,{username:'test-company',password:'private-test-password'}),true);req.headers.cookie=headers['Set-Cookie'][0].split(';')[0];assert.equal((await companySession(req)).id,'racketclub');
  await configureCompanyAccount('racketclub',{username:'test-company',password:'replacement-password'});assert.equal(await companySession(req),null);
  const defaults=await readFile(new URL('../config/companies.json',import.meta.url),'utf8');assert.ok(!defaults.includes('passwordHash'));assert.equal((await companyAccounts())[0].username,'test-company');
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(directory,{recursive:true,force:true});}
});
