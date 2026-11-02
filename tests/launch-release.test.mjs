import test from 'node:test';import assert from 'node:assert/strict';
import {checkoutLaunchConfiguration} from '../lib/launch-release.mjs';
import {blocksLaunchOrder} from '../dist/launch-config.mjs';
const ready=()=>({env:{SMERCH_ORDERS_ENABLED:'1',SMERCH_FINANCE_ENABLED:'1',SMERCH_FINANCE_START_AT:'2026-01-01T00:00:00Z',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',SMERCH_AUTOMATIC_SHIPMENT_CAPTURE:'1',SMERCH_PAYMENT_RECEIPT_MAIL:'review',SMERCH_ACCOUNTANT_MAIL:'review'},automation:{proofMailboxEnabled:true,supplierCustomerMail:'disabled',proofPublication:'review',shipmentMail:'review',confirmationMail:'automatic',decisionReceipt:'automatic'},mailboxPaused:false,payment:{ready:true,mode:'live',provider:'quickpay'},handoff:{ready:true,mode:'live'},mailReady:true});
test('explicit release opens creation and renewal only with ready live payment, supplier and mail',()=>{
 const config=checkoutLaunchConfiguration(ready());assert.equal(config.ordersEnabled,true);assert.ok(Object.isFrozen(config));
 for(const path of ['/api/checkout/session','/api/checkout/pay-example/reauthorize'])assert.equal(blocksLaunchOrder(path,'POST',config),false);
});
for(const value of [undefined,'0','true','yes',' 1','1 ',1,true])test('missing or non-exact release value '+JSON.stringify(value)+' stays closed',()=>{
 const config=checkoutLaunchConfiguration({...ready(),env:{SMERCH_ORDERS_ENABLED:value}});assert.equal(config.ordersEnabled,false);assert.equal(blocksLaunchOrder('/api/checkout/session','POST',config),true);
});
for(const [name,patch] of [['test payments',{payment:{ready:true,mode:'test'}}],['unready payments',{payment:{ready:false,mode:'live'}}],['test supplier',{handoff:{ready:true,mode:'test'}}],['unready supplier',{handoff:{ready:false,mode:'live'}}],['missing mail',{mailReady:false}],['missing payment status',{payment:undefined}],['missing supplier status',{handoff:undefined}]])test(name+' cannot be released by the switch',()=>{
 const c=checkoutLaunchConfiguration({...ready(),...patch});assert.equal(c.ordersEnabled,false);assert.equal(blocksLaunchOrder('/api/checkout/pay-example/reauthorize','POST',c),true);
});

for(const [key,value] of [['SMERCH_FINANCE_ENABLED','0'],['SMERCH_PAYMENT_AGREEMENT_CONFIRMED','0'],['SMERCH_AUTOMATIC_SHIPMENT_CAPTURE','0'],['SMERCH_AUTOMATIC_SHIPMENT_CAPTURE',undefined],['SMERCH_PAYMENT_RECEIPT_MAIL','automatic'],['SMERCH_PAYMENT_RECEIPT_MAIL',undefined],['SMERCH_ACCOUNTANT_MAIL','automatic'],['SMERCH_ACCOUNTANT_MAIL',undefined]])test('dispatch startup refuses '+key+'='+value,()=>{
 const input=ready();input.env[key]=value;assert.equal(checkoutLaunchConfiguration(input).ordersEnabled,false);
});
for(const [key,value] of [['proofMailboxEnabled',false],['supplierCustomerMail','enabled'],['supplierCustomerMail','unknown'],['proofPublication','automatic'],['shipmentMail','automatic'],['confirmationMail','review'],['decisionReceipt','review']])test('reviewed startup refuses '+key+'='+value,()=>{
 const input=ready();input.automation[key]=value;assert.equal(checkoutLaunchConfiguration(input).ordersEnabled,false);
});
for(const state of [true,undefined])test('paused or unknown mailbox prevents public opening: '+state,()=>{
 assert.equal(checkoutLaunchConfiguration({...ready(),mailboxPaused:state}).ordersEnabled,false);
});

for(const value of [undefined,'','invalid','2099-01-01T00:00:00Z'])test('dispatch capture release requires an effective finance start: '+value,()=>{const input=ready();input.env.SMERCH_FINANCE_START_AT=value;assert.equal(checkoutLaunchConfiguration(input).ordersEnabled,false);});
for(const provider of [undefined,'stripe'])test('automatic dispatch release requires the supported new-order provider: '+provider,()=>{const input=ready();input.payment.provider=provider;assert.equal(checkoutLaunchConfiguration(input).ordersEnabled,false);});
