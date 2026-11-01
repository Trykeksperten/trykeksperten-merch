import test from 'node:test';import assert from 'node:assert/strict';
import {createClientAddressResolver,validateClientAddressConfiguration,clientAddressDiagnostics} from '../lib/client-address.mjs';
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
