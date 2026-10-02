import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDelivery} from '../lib/checkout.mjs';
const address={name:'Test',email:'test@example.dk',phone:'12345678',street:'Testvej 1',postalCode:'2300',city:'København S',country:'DK'};
test('delivery accepts Denmark and rejects other or missing country codes even with a Danish postal code',()=>{
 assert.equal(validateDelivery(address).country,'DK');
 for(const country of ['SE','DE','NO','GB','GL','FO','',undefined]) assert.throws(()=>validateDelivery({...address,country}),/kun til Danmark/);
});
