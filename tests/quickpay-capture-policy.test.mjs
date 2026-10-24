import test from 'node:test';
import assert from 'node:assert/strict';
import {quickpayCaptureWindow} from '../lib/quickpay-capture-policy.mjs';
const at=Date.parse('2026-01-01T12:00:00Z'),day=86400000;
const order={totalIncVat:10000,authorizationExpiresAt:new Date(at+day).toISOString()};
const payment={acquirer:'clearhaus',accepted:true,operations:[{type:'authorize',amount:10000,created_at:new Date(at).toISOString(),pending:false,qp_status_code:'20000'}]};
test('Clearhaus permits full capture after visible reservation expiry; flags late capture after seven days',()=>{
 const window=quickpayCaptureWindow(order,payment,{now:at+20*day});assert.equal(window.valid,true);assert.equal(window.lateCapture,true);assert.equal(window.expiresAt,new Date(at+179*day).toISOString());
 assert.equal(quickpayCaptureWindow(order,payment,{now:at+7*day}).lateCapture,false);
});
test('Clearhaus blocks capture at deadline and with missing, future, rejected or pending authorization',()=>{
 assert.equal(quickpayCaptureWindow(order,payment,{now:at+179*day}).valid,false);
 for(const change of [{created_at:null},{created_at:new Date(at+30*day).toISOString()},{pending:true},{qp_status_code:'40000'},{amount:9999}])assert.equal(quickpayCaptureWindow(order,{...payment,operations:[{...payment.operations[0],...change}]},{now:at+20*day}).valid,false);
 assert.equal(quickpayCaptureWindow(order,{...payment,accepted:false},{now:at+20*day}).valid,false);
});
test('unknown acquirers do not inherit Clearhaus terms, even if configured for another provider',()=>{
 assert.equal(quickpayCaptureWindow(order,{...payment,acquirer:'nets'},{now:at+20*day,env:{QUICKPAY_ACQUIRER:'clearhaus'}}).valid,false);
 assert.equal(quickpayCaptureWindow(order,{...payment,acquirer:undefined},{now:at+20*day,env:{QUICKPAY_ACQUIRER:'clearhaus'}}).valid,true);
 assert.equal(quickpayCaptureWindow(order,{...payment,acquirer:undefined},{now:at+20*day,env:{}}).valid,false);
});
