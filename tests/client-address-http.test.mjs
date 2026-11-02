import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {once} from 'node:events';import {scryptSync} from 'node:crypto';import {createServer} from 'node:net';
import {createServer as createHTTPServer,request as httpRequest} from 'node:http';
async function server(t,proxyEnv={}){
 const root=await mkdtemp(join(tmpdir(),'smerch-client-ip-http-')),probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['--import',fileURLToPath(new URL('../scripts/test-local-fetch-only.mjs',import.meta.url)),fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),SMERCH_DATA_DIR:root,PF_GATEWAY_MODE:'test',SMERCH_PUBLIC_BASE_URL:base,SMERCH_CUSTOMER_BASE_URL:base,...proxyEnv},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Synthetic server failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
 const contact=async(headers={})=>fetch(base+'/api/contact',{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify({name:'Synthetic only',email:'synthetic@example.invalid',subject:'Andet',message:'SYNTHETIC REQUEST - NO REAL MAIL',website:'honeypot'})});
 const login=async(headers={})=>fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{"username":"synthetic-wrong","password":"synthetic-wrong"}'});
 return {base,contact,login,post:(path,headers={},body={})=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify(body)})};
}
const renderProxyEnv={RENDER:'true',RENDER_SERVICE_TYPE:'web',SMERCH_PROXY_TRUST_MODE:'render-workspace'};
async function syntheticPublicEdge(t,target,clientIP){
 const edge=createHTTPServer((incoming,outgoing)=>{
  // Emulate the documented public-edge overwrite; the client cannot set clientIP.
  const upstream=httpRequest(new URL(incoming.url,target),{method:incoming.method,headers:{...incoming.headers,host:new URL(target).host,'cf-connecting-ip':clientIP}},response=>{
   outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
  });
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
 });
 await new Promise(resolve=>edge.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{edge.closeAllConnections();await new Promise(resolve=>edge.close(resolve));});
 const base=`http://127.0.0.1:${edge.address().port}`;
 return (path,headers,body)=>fetch(base+path,{method:'POST',headers:{origin:target,'content-type':'application/json',...headers},body:JSON.stringify(body)});
}
test('real contact limiter cannot be bypassed by changing forwarded headers on an untrusted connection',async t=>{
 const app=await server(t);
 for(let i=0;i<5;i++)assert.equal((await app.contact({'x-forwarded-for':`198.51.100.${i+1}`,'cf-connecting-ip':`203.0.113.${i+1}`})).status,201);
 assert.equal((await app.contact({'x-forwarded-for':'192.0.2.99','cf-connecting-ip':'203.0.113.99'})).status,429);
});
test('explicit trusted proxy separates real clients while a forged XFF cannot reset contact or login counters',async t=>{
 const app=await server(t,{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.1/32',SMERCH_CLIENT_IP_HEADER:'cf-connecting-ip'}),first={'cf-connecting-ip':'203.0.113.10'},second={'cf-connecting-ip':'203.0.113.11'};
 for(let i=0;i<5;i++)assert.equal((await app.contact({...first,'x-forwarded-for':`198.51.100.${i+1}`})).status,201);
 assert.equal((await app.contact(first)).status,429);assert.equal((await app.contact(second)).status,201);
 for(let i=0;i<5;i++)assert.equal((await app.login({...first,'x-forwarded-for':`198.51.100.${i+1}`})).status,401);
 assert.equal((await app.login(first)).status,429);assert.equal((await app.login(second)).status,401);
});

test('equivalent IPv6 and mapped IPv4 headers share the real contact limit',async t=>{
 for(const variants of [
  ['2001:db8::a','2001:0DB8::A','2001:db8:0:0::a','2001:db8:0:0:0:0:0:a','2001:0db8:0000:0000:0000:0000:0000:000a','2001:DB8::000A'],
  ['203.0.113.9','::ffff:203.0.113.9','::FFFF:203.0.113.9','::ffff:cb00:7109','0:0:0:0:0:ffff:cb00:7109','203.0.113.9']
 ]){
  const app=await server(t,{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.1/32'});
  for(const value of variants.slice(0,5))assert.equal((await app.contact({'cf-connecting-ip':value})).status,201);
  assert.equal((await app.contact({'cf-connecting-ip':variants[5]})).status,429);
  assert.equal((await app.contact({'cf-connecting-ip':'203.0.113.88'})).status,201);
 }
});
test('real XFF proxy chains ignore forged left entries and retain separate contact and admin-login clients',async t=>{
 const app=await server(t,{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.0/8',SMERCH_CLIENT_IP_HEADER:'x-forwarded-for'});
 const headers=(client,spoof)=>({'x-forwarded-for':`${spoof}, ${client}, 127.0.0.2`,'cf-connecting-ip':spoof});
 for(let i=1;i<=5;i++)assert.equal((await app.contact(headers('198.51.100.10','192.0.2.'+i))).status,201);
 assert.equal((await app.contact(headers('198.51.100.10','192.0.2.99'))).status,429);
 assert.equal((await app.contact(headers('198.51.100.11','192.0.2.99'))).status,201);
 for(let i=1;i<=5;i++)assert.equal((await app.login(headers('198.51.100.10','192.0.2.'+i))).status,401);
 assert.equal((await app.login(headers('198.51.100.10','192.0.2.99'))).status,429);
 assert.equal((await app.login(headers('198.51.100.11','192.0.2.99'))).status,401);
});
for(const [mode,proxyEnv] of [['CIDR',{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.1/32'}],['Render workspace',renderProxyEnv]])test(`real address, Pantone, company-login and statistics counters use the same trusted client identity (${mode})`,async t=>{
 const app=await server(t,proxyEnv),first='2001:db8::5',second='2001:db8::6';
 const headers=(ip,i=0)=>({'cf-connecting-ip':ip,'x-forwarded-for':'192.0.2.'+(i%250+1),'x-smerch-company':'1','user-agent':'Smerch synthetic test'});
 for(const [path,count,body,status] of [
  ['/api/addresses',90,{query:''},200],
  ['/api/artwork/pantone',90,{},400],
  ['/api/company/login',5,{username:'synthetic-unknown',password:'synthetic-wrong'},401],
  ['/api/shop-statistics',600,{},400]
 ]){
  for(let i=0;i<count;i++)assert.equal((await app.post(path,headers(first,i),body)).status,status,path);
  assert.equal((await app.post(path,headers('2001:0DB8:0:0:0:0:0:0005',count),body)).status,429,path);
  assert.equal((await app.post(path,headers(second),body)).status,status,path);
 }
});
test('admin network diagnostics require login and contain no cookie, credential or raw XFF',async t=>{
 const salt='ab'.repeat(16),password='SYNTHETIC-ADMIN-PASSWORD',hash=scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
 const app=await server(t,{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.1/32',SMERCH_ADMIN_USERNAME:'synthetic-admin',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash});
 assert.equal((await fetch(app.base+'/api/admin/operations')).status,401);
 const login=await app.post('/api/admin/login',{'cf-connecting-ip':'2001:0DB8::A'},{username:'synthetic-admin',password});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0],response=await fetch(app.base+'/api/admin/operations',{headers:{cookie,'cf-connecting-ip':'2001:0DB8::A','x-forwarded-for':'SYNTHETIC-RAW-XFF',authorization:'SYNTHETIC-CREDENTIAL'}});
 assert.equal(response.status,200);const network=(await response.json()).network;
 assert.equal(network.transportAddress,'127.0.0.1');assert.equal(network.resolvedClientAddress,'2001:db8::a');assert.equal(network.edgeHeaderAddress,'2001:db8::a');assert.equal(network.forwardingConfigured,true);
 assert.doesNotMatch(JSON.stringify(network),/SYNTHETIC|cookie|authorization|password/);assert.ok(!JSON.stringify(network).includes(cookie));
});

test('Render public-edge overwrite prevents spoofed headers from resetting real contact and admin-login limits',async t=>{
 const app=await server(t,renderProxyEnv),first=await syntheticPublicEdge(t,app.base,'203.0.113.10'),second=await syntheticPublicEdge(t,app.base,'203.0.113.11');
 const contact={name:'Synthetic',email:'synthetic@example.invalid',subject:'Andet',message:'SYNTHETIC ONLY',website:'honeypot'};
 const forged=i=>({'cf-connecting-ip':`198.51.100.${i}`,'x-forwarded-for':`192.0.2.${i}, 10.0.0.9`});
 for(let i=1;i<=5;i++)assert.equal((await first('/api/contact',forged(i),contact)).status,201);
 assert.equal((await first('/api/contact',forged(99),contact)).status,429);
 assert.equal((await second('/api/contact',{'cf-connecting-ip':'203.0.113.10'},contact)).status,201);
 const login={username:'synthetic-unknown',password:'synthetic-wrong'};
 for(let i=1;i<=5;i++)assert.equal((await first('/api/admin/login',forged(i),login)).status,401);
 assert.equal((await first('/api/admin/login',forged(99),login)).status,429);
 assert.equal((await second('/api/admin/login',{'cf-connecting-ip':'203.0.113.10'},login)).status,401);
});
test('Render mode missing or malformed CF headers share socket fallback and do not accept a forged XFF identity',async t=>{
 const app=await server(t,renderProxyEnv);
 for(const [i,value] of [undefined,'not-an-IP','203.0.113.9, 203.0.113.10','[::1]','x'.repeat(1025)].entries()){
  const headers={'x-forwarded-for':'198.51.100.'+(i+1)};
  if(value!==undefined)headers['cf-connecting-ip']=value;
  assert.equal((await app.contact(headers)).status,201);
 }
 assert.equal((await app.contact({'x-forwarded-for':'198.51.100.250'})).status,429);
});
test('admin diagnostics report Render workspace trust without implying private ingress was authenticated',async t=>{
 const salt='cd'.repeat(16),password='SYNTHETIC-RENDER-ADMIN',hash=scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
 const app=await server(t,{...renderProxyEnv,SMERCH_ADMIN_USERNAME:'synthetic-admin',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash});
 assert.equal((await fetch(app.base+'/api/admin/operations')).status,401);
 const login=await app.post('/api/admin/login',{'cf-connecting-ip':'203.0.113.12'},{username:'synthetic-admin',password});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await fetch(app.base+'/api/admin/operations',{headers:{cookie,'cf-connecting-ip':'203.0.113.12','x-forwarded-for':'SYNTHETIC-RAW',authorization:'SYNTHETIC-SECRET'}});
 assert.equal(response.status,200);const network=(await response.json()).network;
 assert.equal(network.trustMode,'render-workspace');assert.equal(network.privateNetworkTrusted,true);
 assert.equal(network.resolvedClientAddress,'203.0.113.12');assert.equal(network.forwardingConfigured,true);
 assert.doesNotMatch(JSON.stringify(network),/SYNTHETIC|cookie|authorization/);assert.ok(!JSON.stringify(network).includes(cookie));
});
