import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBilling} from '../lib/billing.mjs';
const billing={company:'Example ApS',cvr:'12345678',email:'invoice@example.dk',reference:'PO-123',street:'Fakturavej 2',postalCode:'2100',city:'København Ø',country:'DK',ean:''};
const shipping={name:'Modtager',email:'delivery@example.dk',street:'Leveringsvej 10, 2. tv.',postalCode:'2300',city:'København S',country:'DK'};
test('business orders require complete billing before any payment, including test orders',()=>{
 assert.deepEqual(validateBilling(billing,'business'),billing);
 for(const field of ['company','cvr','email','street','postalCode','city','country'])assert.throws(()=>validateBilling({...billing,[field]:''},'business'));
 for(const invalid of [{cvr:'1234'},{postalCode:'abc'},{country:'SE'},{ean:'123'}])assert.throws(()=>validateBilling({...billing,...invalid},'business'));
 assert.equal(validateBilling(billing,'consumer'),null);assert.throws(()=>validateBilling(billing,''));
});
test('explicit delivery-address choice copies the verified address but preserves invoice company and email',()=>{
 const input={...billing,useDeliveryAddress:true,street:'',postalCode:'',city:'',country:''},result=validateBilling(input,'business',shipping);
 for(const key of ['street','postalCode','city','country'])assert.equal(result[key],shipping[key]);assert.equal(result.company,billing.company);assert.equal(result.email,billing.email);assert.equal(result.cvr,billing.cvr);assert.equal(input.street,'');
 assert.throws(()=>validateBilling(input,'business'),/Leveringsadressen/);assert.throws(()=>validateBilling(input,'business',{...shipping,street:''}),/komplet/);
});
test('a separate invoice address is never overwritten or silently replaced with delivery data',()=>{
 assert.deepEqual(validateBilling({...billing,useDeliveryAddress:false},'business',shipping),billing);
 assert.throws(()=>validateBilling({...billing,street:'',useDeliveryAddress:false},'business',shipping),/komplet/);
 assert.throws(()=>validateBilling({...billing,street:''},'business',shipping),/komplet/);
});
