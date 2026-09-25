import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,scryptSync} from 'node:crypto';
import {adminSessionAuthorized,closeAdminSession,createAdminSession} from '../lib/admin-auth.mjs';

test('staff login creates a server session and logout revokes order access',()=>{
 const salt=randomBytes(16).toString('hex'),password='example-test-secret',env={SMERCH_ADMIN_USERNAME:'staff@example.dk',SMERCH_ADMIN_PASSWORD_HASH:`${salt}:${scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex')}`};
 const headers={},response={setHeader:(name,value)=>{headers[name]=value;}},request={socket:{remoteAddress:'test-login'},method:'POST',headers:{host:'localhost:5173',origin:'http://localhost:5173','x-smerch-admin':'1'}};
 assert.equal(createAdminSession(request,response,{username:'staff@example.dk',password:'incorrect'},env),false);
 assert.equal(createAdminSession(request,response,{username:'staff@example.dk',password},env),true);
 assert.match(headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
 request.headers.cookie=headers['Set-Cookie'].split(';')[0];
 assert.equal(adminSessionAuthorized(request),true);
 assert.equal(adminSessionAuthorized({...request,headers:{...request.headers,'x-smerch-admin':undefined}}),false);
 assert.equal(adminSessionAuthorized({...request,headers:{...request.headers,origin:'https://attacker.example'}}),false);
 closeAdminSession(request,response);
 assert.equal(adminSessionAuthorized(request),false);
});
