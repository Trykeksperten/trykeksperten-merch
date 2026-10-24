// Address selection affects new checkout data only; existing orders are not migrated.
export function syncBillingFields(form,business){
 const active=form.elements.customerType.value==='business',separate=form.elements.differentBillingAddress.checked;
 business.hidden=!active;
 for(const field of business.querySelectorAll('input,select')){
  const address=['billingStreet','billingPostalCode','billingCity','billingCountry'].includes(field.name);
  field.disabled=!active||address&&!separate;
  field.required=!field.disabled&&!['billingReference','billingEan','differentBillingAddress'].includes(field.name);
  if(address)field.closest('label').hidden=!separate;
 }
}
