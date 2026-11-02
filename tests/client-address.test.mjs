import test from 'node:test';import assert from 'node:assert/strict';
import {createClientAddressResolver,validateClientAddressConfiguration,clientAddressDiagnostics,clientAddress} from '../lib/client-address.mjs';
const req=(peer,headers={})=>({socket:{remoteAddress:peer},headers});
test('default resolver ignores spoofed forwarding headers and normalizes socket IPv4 mapping',()=>{
 const resolve=createClientAddressResolver();assert.equal(resolve(req('::ffff:192.0.2.7',{'x-forwarded-for':'198.51.100.9','cf-connecting-ip':'203.0.113.5'})),'192.0.2.7');assert.equal(resolve(req('test-socket',{'cf-connecting-ip':'203.0.113.5'})),'test-socket');
});
test('Cloudflare single-IP header requires an explicitly trusted transport peer',()=>{
 const resolve=createClientAddressResolver({cidrs:'10.2.0.0/16'});assert.equal(resolve(req('10.2.0.7',{'cf-connecting-ip':'203.0.113.4'})),'203.0.113.4');assert.equal(resolve(req('198.51.100.7',{'cf-connecting-ip':'203.0.113.4'})),'198.51.100.7');
 for(const value of ['1.2.3.4, 5.6.7.8','127.0.0.1:1234','not-an-IP','',Array(2).fill('1.2.3.4')])assert.equal(resolve(req('10.2.0.7',{'cf-connecting-ip':value})),'10.2.0.7');
});
test('trusted forwarded chains are walked from the transport end and cannot use a spoofed leftmost IP',()=>{
 const resolve=createClientAddressResolver({cidrs:'10.2.0.0/16',header:'x-forwarded-for'});assert.equal(resolve(req('10.2.0.7',{'x-forwarded-for':'1.1.1.1, 203.0.113.4, 10.2.0.8'})),'203.0.113.4');
 assert.equal(resolve(req('10.2.0.7',{'x-forwarded-for':'1.1.1.1, invalid'})),'10.2.0.7');assert.equal(resolve(req('10.2.0.7',{'x-forwarded-for':Array(21).fill('1.1.1.1').join(',')})),'10.2.0.7');
});
test('IPv6 trust works, while wildcard ranges, malformed prefixes and unsupported headers are rejected',()=>{
 const resolve=createClientAddressResolver({cidrs:'2001:db8:1::/64'});assert.equal(resolve(req('2001:db8:1::2',{'cf-connecting-ip':'2001:db8:2::3'})),'2001:db8:2::3');
 for(const cidrs of ['0.0.0.0/0','::/0','10.0.0.0/33','not-an-IP/12','10.0.0.1','10.0.0.0/8/extra'])assert.throws(()=>createClientAddressResolver({cidrs}),{code:'PROXY_CONFIG_INVALID'});
 assert.throws(()=>validateClientAddressConfiguration({SMERCH_CLIENT_IP_HEADER:'x-real-ip'}),{code:'PROXY_CONFIG_INVALID'});
});

test('admin diagnostics expose only normalized addresses of this request and no credentials or raw header chain',()=>{
 const input=req('127.0.0.1',{'cf-connecting-ip':'203.0.113.7',authorization:'SECRET-CREDENTIAL',cookie:'SECRET-COOKIE','x-forwarded-for':'SECRET-RAW'});
 const status=clientAddressDiagnostics(input,{});assert.equal(status.forwardingConfigured,false);assert.equal(status.resolvedClientAddress,'127.0.0.1');assert.equal(status.edgeHeaderAddress,'203.0.113.7');assert.doesNotMatch(JSON.stringify(status),/SECRET|authorization|cookie/);
});

test('equivalent IPv6 and mapped IPv4 spellings cannot create different rate-limit identities',()=>{
 const resolve=createClientAddressResolver({cidrs:'127.0.0.1/32'});
 for(const address of ['2001:db8::a','2001:0DB8::A','2001:db8:0:0::a','2001:0db8:0000:0000:0000:0000:0000:000a'])assert.equal(resolve(req('127.0.0.1',{'cf-connecting-ip':address})),'2001:db8::a');
 for(const address of ['192.0.2.1','::ffff:192.0.2.1','::FFFF:192.0.2.1','::ffff:c000:201','0:0:0:0:0:FFFF:C000:0201'])assert.equal(resolve(req('127.0.0.1',{'cf-connecting-ip':address})),'192.0.2.1');
 assert.equal(createClientAddressResolver()(req('2001:0DB8:0:0::A')),'2001:db8::a');
});
test('mixed-family XFF chains stop at the nearest untrusted client and normalize equivalent addresses',()=>{
 const resolve=createClientAddressResolver({cidrs:'10.2.0.0/16,2001:db8:1::/64',header:'x-forwarded-for'});
 assert.equal(resolve(req('::FFFF:10.2.0.7',{'x-forwarded-for':'192.0.2.99, 2001:0DB8:2:0::A, 2001:db8:1::8'})),'2001:db8:2::a');
 assert.equal(resolve(req('10.2.0.7',{'x-forwarded-for':'192.0.2.99, ::ffff:c000:0201, 10.2.0.8'})),'192.0.2.1');
 assert.equal(resolve(req('2001:db8:2::7',{'x-forwarded-for':'198.51.100.5'})),'2001:db8:2::7');
});
test('missing, duplicated, oversized or malformed chosen headers never fall back to a different forwarding header',()=>{
 const resolve=createClientAddressResolver({cidrs:'10.2.0.0/16'});
 for(const value of [undefined,['203.0.113.1','203.0.113.2'],'203.0.113.1, 203.0.113.2','[2001:db8::a]','fe80::1%lo','x'.repeat(1025)])assert.equal(resolve(req('10.2.0.7',{'cf-connecting-ip':value,'x-forwarded-for':'198.51.100.77'})),'10.2.0.7');
 assert.equal(createClientAddressResolver({cidrs:'10.2.0.0/16',header:'x-forwarded-for'})(req('10.2.0.7',{'x-forwarded-for':Array(21).fill('192.0.2.1').join(','),'cf-connecting-ip':'203.0.113.1'})),'10.2.0.7');
});
test('proxy configuration rejects excessive lists and whitespace-only settings do not claim trust is active',()=>{
 for(const cidrs of [Array(33).fill('10.0.0.1/32').join(','),'x'.repeat(2049),'10.0.0.1/32,','10.0.0.1/-1','::/129'])assert.throws(()=>createClientAddressResolver({cidrs}),{code:'PROXY_CONFIG_INVALID'});
 const status=clientAddressDiagnostics(req('127.0.0.1'),{SMERCH_TRUSTED_PROXY_CIDRS:'  '});assert.equal(status.forwardingConfigured,false);assert.equal(status.configuredHeader,null);
});

const renderEnv={RENDER:'true',RENDER_SERVICE_TYPE:'web',SMERCH_PROXY_TRUST_MODE:'render-workspace'};
test('being on Render alone never enables provider header trust',()=>{
 const input=req('10.9.0.7',{'cf-connecting-ip':'203.0.113.5','x-forwarded-for':'198.51.100.9'});
 assert.equal(clientAddress(input,{RENDER:'true',RENDER_SERVICE_TYPE:'web'}),'10.9.0.7');
 assert.equal(clientAddressDiagnostics(input,{RENDER:'true',RENDER_SERVICE_TYPE:'web'}).trustMode,'socket');
});
test('explicit Render workspace mode requires the Render web runtime and rejects ambiguous or unknown configuration',()=>{
 validateClientAddressConfiguration(renderEnv);
 for(const env of [
  {...renderEnv,RENDER:undefined},{...renderEnv,RENDER:'false'},
  {...renderEnv,RENDER_SERVICE_TYPE:'pserv'}, {...renderEnv,RENDER_SERVICE_TYPE:undefined},
  {...renderEnv,SMERCH_PROXY_TRUST_MODE:'render'}, {...renderEnv,SMERCH_PROXY_TRUST_MODE:'*'},
  {...renderEnv,SMERCH_TRUSTED_PROXY_CIDRS:'10.0.0.0/8'},
  {...renderEnv,SMERCH_CLIENT_IP_HEADER:'x-forwarded-for'}
 ])assert.throws(()=>validateClientAddressConfiguration(env),{code:'PROXY_CONFIG_INVALID'});
 assert.throws(()=>createClientAddressResolver({mode:'render-workspace'}),{code:'PROXY_CONFIG_INVALID'});
});
test('Render mode uses only a single normalized CF address and never falls back to XFF',()=>{
 const input=headers=>req('10.9.0.7',{'x-forwarded-for':'198.51.100.9',...headers});
 assert.equal(clientAddress(req('test-socket',{'cf-connecting-ip':'203.0.113.9'}),renderEnv),'test-socket');
 assert.equal(clientAddress(input({'cf-connecting-ip':'2001:0DB8:0000:0000::A'}),renderEnv),'2001:db8::a');
 assert.equal(clientAddress(input({'cf-connecting-ip':'::ffff:cb00:7109'}),renderEnv),'203.0.113.9');
 for(const value of [undefined,'',[],['203.0.113.1','203.0.113.2'],'203.0.113.1, 203.0.113.2','[2001:db8::a]','fe80::1%lo','not-an-IP','x'.repeat(1025)]){
  assert.equal(clientAddress(input({'cf-connecting-ip':value}),renderEnv),'10.9.0.7');
 }
});
test('Render workspace trust explicitly also trusts a private sender with a forged valid header',()=>{
 // This is the documented limitation, not proof of a separate public-edge boundary.
 const privateSender=req('10.1.2.3',{'cf-connecting-ip':'203.0.113.77'});
 assert.equal(clientAddress(privateSender,renderEnv),'203.0.113.77');
 assert.equal(clientAddress(privateSender,{}),'10.1.2.3');
 const diagnostic=clientAddressDiagnostics(privateSender,renderEnv);
 assert.equal(diagnostic.trustMode,'render-workspace');assert.equal(diagnostic.privateNetworkTrusted,true);
 assert.equal(diagnostic.configuredHeader,'cf-connecting-ip');assert.equal(diagnostic.forwardingConfigured,true);
});
test('changing provider opt-in or runtime flags cannot reuse a previously trusted resolver',()=>{
 const input=req('10.1.2.3',{'cf-connecting-ip':'203.0.113.77'});
 assert.equal(clientAddress(input,renderEnv),'203.0.113.77');
 assert.equal(clientAddress(input,{...renderEnv,SMERCH_PROXY_TRUST_MODE:undefined}),'10.1.2.3');
 assert.throws(()=>clientAddress(input,{...renderEnv,RENDER:'false'}),{code:'PROXY_CONFIG_INVALID'});
 assert.equal(clientAddress(input,renderEnv),'203.0.113.77');
});
