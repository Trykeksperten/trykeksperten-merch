import test from 'node:test';
import assert from 'node:assert/strict';
import {pfTestEnvironment} from '../lib/pf-test-env.mjs';
import {gatewayConfiguration,submitPFOrder} from '../lib/pf-gateway.mjs';
test('explicit admin tests use only test endpoint and test credentials while production remains live',async()=>{
 const live={PF_GATEWAY_MODE:'live',PF_GATEWAY_LIVE_ENABLED:'1',PF_GATEWAY_USERNAME:'user',PF_GATEWAY_TEST_PASSWORD:'sandbox',PF_GATEWAY_PROD_PASSWORD:'production',PF_GATEWAY_PASSWORD:'production',PF_GATEWAY_SENDER_ID:'SMERCH',PF_COMMUNICATION_EMAIL:'proof@example.com'};
 const env=pfTestEnvironment(live);assert.match(gatewayConfiguration(env).endpoint,/\/test\//);assert.equal(live.PF_GATEWAY_MODE,'live');assert.equal(live.PF_GATEWAY_PASSWORD,'production');
 await submitPFOrder({Header:{isTest:true,messageId:'test'}},{env,fetchImpl:async(url,opts)=>{assert.match(url,/\/test\//);assert.equal(Buffer.from(opts.headers.Authorization.slice(6),'base64').toString(),'user:sandbox');return {ok:true,status:200,json:async()=>({status:'success',yourMessageId:'test'})};}});
 await assert.rejects(submitPFOrder({Header:{isTest:false}},{env}),/Testflag/);
});
test('never fall back to production credentials or enable a disabled gateway',()=>{
 assert.throws(()=>pfTestEnvironment({PF_GATEWAY_MODE:'live',PF_GATEWAY_PASSWORD:'production'}),/testadgangskoden/);
 assert.throws(()=>pfTestEnvironment({PF_GATEWAY_MODE:'off',PF_GATEWAY_TEST_PASSWORD:'sandbox'}),/ikke aktiveret/);
 assert.equal(pfTestEnvironment({PF_GATEWAY_MODE:'test',PF_GATEWAY_PASSWORD:'legacy-test'}).PF_GATEWAY_TEST_PASSWORD,'legacy-test');
});
