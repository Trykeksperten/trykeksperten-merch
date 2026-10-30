import test from 'node:test';
import assert from 'node:assert/strict';
import {documentPaymentPolicy} from '../lib/document-payment-policy.mjs';
import {documentSeed,reviewDocument} from '../lib/order-documents.mjs';
const bank=()=>({id:'pay-bank-demo',createdAt:'2026-10-27T10:00:00Z',paymentProvider:'bank_transfer',status:'awaiting_bank_payment',totalIncVat:12500,bankPayment:{receipts:[]},shipping:{name:'Demo Kontakt',company:'Kunde ApS',street:'Vej 1',postalCode:'2300',city:'København S',email:'kunde@example.test'},billing:{company:'Kunde ApS',street:'Vej 1',postalCode:'2300',city:'København S'},lines:[{productId:'cap',sku:'CAP',quantity:1,decorations:[]}],productNames:{cap:'Kasket'},quote:{net:10000,lines:[{net:10000,vat:2500}]},freightExVat:0});
test('bank basis requires a prepayment invoice and full payment before ordering, with no card terms',()=>{
 const checkout=bank(),order={id:'ord-demo',createdAt:checkout.createdAt,lines:checkout.lines},company={name:'Smerch',legalName:'Sælger ApS',address:'Vej 2',cvr:'12345678',email:'hello@example.test',phone:'12345678',paymentTerms:'Kort hæves ved afsendelse.'};
 const before=structuredClone(checkout),seed=documentSeed(order,checkout,company,'basis');
 assert.match(seed.paymentInstruction,/forudbetalingsfaktura/);
 assert.match(seed.paymentTerms,/før varebestilling og produktionsstart/);
 assert.equal(seed.paymentStatus,'Afventer forudbetaling – produktion må ikke startes');
 const checked=reviewDocument(order,checkout,company,{...seed,paymentTerms:'30 dages kredit',paymentInstruction:'Opret kreditfaktura'});
 assert.equal(checked.paymentTerms,seed.paymentTerms);
 assert.equal(checked.paymentInstruction,seed.paymentInstruction);
 assert.deepEqual(checkout,before);
});
test('existing invoice and partial bank receipts prevent instructions to invoice the sale twice',()=>{
 const checkout=bank();checkout.bankPayment={invoiceNumber:'1234',receipts:[{amount:5000}]};
 const p=documentPaymentPolicy(checkout);assert.match(p.paymentInstruction,/1234.*allerede registreret/);assert.match(p.paymentInstruction,/opret ikke en ny/);
 assert.equal(p.paymentReceived,5000);assert.equal(p.paymentOutstanding,7500);assert.match(p.paymentStatus,/Delvist betalt/);
 checkout.status='paid';checkout.paidAt='2026-10-27T11:00:00Z';checkout.bankPayment.receipts.push({amount:7500});
 assert.equal(documentPaymentPolicy(checkout).paymentStatus,'Betalt via bankoverførsel');
});
test('card orders never acquire bank prepayment instructions',()=>{assert.deepEqual(documentPaymentPolicy({...bank(),paymentProvider:'quickpay'}),{});});
