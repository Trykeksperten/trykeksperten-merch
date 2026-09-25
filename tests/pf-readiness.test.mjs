import test from 'node:test';
import assert from 'node:assert/strict';
import {pfReadiness} from '../lib/pf-readiness.mjs';

const base={
 PF_PRICE_FEED_URL:'https://www.pfconcept.com/portal/datafeed/product',PF_PRINT_PRICE_FEED_URL:'https://www.pfconcept.com/portal/datafeed/print',PF_STOCK_FEED_URL:'https://www.pfconcept.com/portal/datafeed/stock',
 PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'test-user',PF_GATEWAY_TEST_PASSWORD:'test-password',PF_GATEWAY_PROD_PASSWORD:'prod-password',PF_GATEWAY_SENDER_ID:'SMERCH',PF_COMMUNICATION_EMAIL:'proof@smerch.dk'
};

test('readiness identifies the three PF access values without exposing values',()=>{
 const report=pfReadiness({...base,PF_GATEWAY_USERNAME:'',PF_GATEWAY_TEST_PASSWORD:'',PF_GATEWAY_SENDER_ID:''});
 assert.deepEqual(report.phases.gatewayTest.missing,['Gateway test-brugernavn fra PF Technical Support','Gateway test-adgangskode fra PF Technical Support','Sender ID konfigureret og bekræftet af PF']);
 assert.ok(!JSON.stringify(report).includes('test-password'));
});

test('gateway test becomes ready when PF access and feeds are configured',()=>{
 const report=pfReadiness(base);
 assert.equal(report.phases.gatewayTest.ready,true);
 assert.equal(report.phases.endToEndTest.ready,false);
 assert.equal(report.phases.live.ready,false);
});

test('complete test flow requires secure delivery, freight and PF colour data',()=>{
 const report=pfReadiness({...base,SMERCH_PUBLIC_BASE_URL:'https://smerch.dk',SMERCH_ARTWORK_SIGNING_SECRET:'a'.repeat(32),PF_PROOF_INBOX_TOKEN:'b'.repeat(32),PF_CALLBACK_USERNAME:'pf',PF_CALLBACK_PASSWORD:'c'.repeat(32),SMERCH_FREIGHT_PL_EX_VAT_DKK:'100',SMERCH_FREIGHT_UK_EX_VAT_DKK:'150',SMERCH_PMS_COLOR_MAP:'{"#e84a12":"Orange 021 C"}'});
 assert.equal(report.phases.endToEndTest.ready,true);
 assert.equal(report.phases.live.ready,false);
});
