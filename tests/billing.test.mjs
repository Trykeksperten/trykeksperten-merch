import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBilling} from '../lib/billing.mjs';
test('business billing requires a company, eight digit CVR and invoice email',()=>{
 const billing={company:'Example ApS',cvr:'12345678',email:'invoice@example.dk',reference:'PO-123'};
 assert.deepEqual(validateBilling(billing,'business'),billing);
 for(const field of ['company','cvr','email'])assert.throws(()=>validateBilling({...billing,[field]:''},'business'));
 assert.throws(()=>validateBilling({...billing,cvr:'1234'},'business'));
 assert.equal(validateBilling(billing,'consumer'),null);
 assert.throws(()=>validateBilling(billing,''));
});
