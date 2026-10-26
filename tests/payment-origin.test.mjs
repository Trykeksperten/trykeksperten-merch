import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentOrigins,checkoutRequestAuthorized} from '../lib/payment-origin.mjs';
const env={SMERCH_PUBLIC_BASE_URL:'https://api.smerch.dk',SMERCH_CUSTOMER_BASE_URL:'https://smerch.dk'};
test('checkout accepts only the configured customer origin and known routing hosts',()=>{
 assert.deepEqual(paymentOrigins(env),{api:'https://api.smerch.dk',customer:'https://smerch.dk'});
 for(const host of ['smerch.dk','api.smerch.dk'])assert.equal(checkoutRequestAuthorized({headers:{origin:'https://smerch.dk',host}},env),true);
 for(const origin of ['https://evil.invalid','https://smerch.dk.evil.invalid','null',undefined])assert.equal(checkoutRequestAuthorized({headers:{origin,host:'api.smerch.dk'}},env),false);
 assert.equal(checkoutRequestAuthorized({headers:{origin:'https://smerch.dk',host:'evil.invalid'}},env),false);
 assert.equal(checkoutRequestAuthorized({headers:{}},{}),false);
});
test('single-origin development remains supported without an override',()=>{
 const local={SMERCH_PUBLIC_BASE_URL:'http://localhost:5173'};assert.equal(paymentOrigins(local).customer,'http://localhost:5173');
 assert.equal(checkoutRequestAuthorized({headers:{origin:'http://localhost:5173',host:'localhost:5173'}},local),true);
 assert.throws(()=>paymentOrigins({...env,SMERCH_CUSTOMER_BASE_URL:'https://user:password@example.invalid'}));
});

test('admin controls use the backend origin independently of the customer storefront',async()=>{
 const {adminRequestOriginAllowed}=await import('../lib/payment-origin.mjs');
 assert.equal(adminRequestOriginAllowed({headers:{host:'api.smerch.dk',origin:'https://api.smerch.dk'}}),true);
 assert.equal(adminRequestOriginAllowed({headers:{host:'127.0.0.1:5195',origin:'http://127.0.0.1:5195'}}),true);
 for(const origin of ['https://smerch.dk','https://api.smerch.dk.evil.invalid','null',undefined])assert.equal(adminRequestOriginAllowed({headers:{host:'api.smerch.dk',origin}}),false);
 assert.equal(adminRequestOriginAllowed({headers:{}}),false);
});
