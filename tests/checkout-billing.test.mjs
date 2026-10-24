import test from 'node:test';
import assert from 'node:assert/strict';
import {syncBillingFields} from '../dist/checkout-billing.mjs';
test('same delivery address is the default; separate billing is required only when chosen and values survive switching',()=>{
 const names=['billingCompany','billingCvr','billingEmail','billingReference','billingStreet','billingPostalCode','billingCity','billingCountry','billingEan','differentBillingAddress'],labels={},fields=names.map(name=>({name,value:name==='billingStreet'?'Anden vej 2':'',checked:false,closest:()=>labels[name]??=( {})})),elements=Object.fromEntries(fields.map(f=>[f.name,f])),form={elements:{...elements,customerType:{value:'business'}}},business={querySelectorAll:()=>fields};
 syncBillingFields(form,business);assert.equal(business.hidden,false);for(const name of ['billingCompany','billingCvr','billingEmail'])assert.equal(elements[name].required,true);assert.equal(elements.differentBillingAddress.required,false);assert.equal(elements.billingStreet.disabled,true);assert.equal(labels.billingStreet.hidden,true);
 elements.differentBillingAddress.checked=true;syncBillingFields(form,business);assert.equal(elements.billingStreet.disabled,false);assert.equal(elements.billingStreet.required,true);assert.equal(labels.billingStreet.hidden,false);assert.equal(elements.billingStreet.value,'Anden vej 2');assert.equal(elements.billingReference.required,false);
 form.elements.customerType.value='consumer';syncBillingFields(form,business);assert.equal(business.hidden,true);assert.ok(fields.every(field=>field.disabled&&!field.required));
 form.elements.customerType.value='business';syncBillingFields(form,business);assert.equal(elements.billingStreet.value,'Anden vej 2');assert.equal(elements.billingStreet.required,true);
});
