import test from 'node:test';
import assert from 'node:assert/strict';
import {documentOrderNumber} from '../lib/document-order-number.mjs';
import {documentSeed} from '../lib/order-documents.mjs';
import {fixture} from './order-documents.test.mjs';
test('documents use supplier order number, never internal payment or purchase IDs',()=>{
 const {order,checkout}=fixture();
 for(const type of ['basis','confirmation'])assert.equal(documentSeed(order,checkout,{},type).reference,'7886901');
 assert.equal(documentOrderNumber({id:'pay-private',purchaseOrderNumber:'SMERCH-private'}),'Afventer ordrenummer');
 assert.equal(documentOrderNumber({pfOrderNumber:'7886901',documentOrderNumbers:['7886901','7886902']}),'7886901, 7886902');
});
