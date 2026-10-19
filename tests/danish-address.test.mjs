import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalAddress,resolveDanishAddress,searchDanishAddresses,verifyDeliveryAddress,createAddressLimiter} from '../lib/danish-address.mjs';
import {validateDelivery} from '../lib/checkout.mjs';
const id='0a3f509e-fb66-32b8-e044-0003ba298018';
const fixture=()=>({status:'ok',adresse:{id_lokalid:id,status:'3',adressebetegnelse:'Jagtvej 120, 1. 101, 2200 København N',etagebetegnelse:'1',doerbetegnelse:'101',husnummer:{status:'3',vejnavn:'Jagtvej',husnummertekst:'120',postnummer:{postnr:'2200',navn:'København N'}}}});
const response=data=>({ok:true,json:async()=>data});
test('canonical address preserves floor, door and supplementary village in the PF street field',()=>{
 const data=fixture();data.adresse.husnummer.supplerendebynavn={navn:'Testby'};const address=canonicalAddress(data);
 assert.equal(address.street,'Jagtvej 120, 1. 101, Testby');assert.equal(address.postalCode,'2200');assert.equal(address.floor,'1');assert.equal(address.door,'101');
 const ground=fixture();ground.adresse.etagebetegnelse='st';ground.adresse.doerbetegnelse='th';assert.equal(canonicalAddress(ground).street,'Jagtvej 120, st. th');
});
test('historical, preliminary and incomplete addresses cannot be selected',()=>{
 for(const mutate of [d=>d.adresse.status='2',d=>d.adresse.husnummer.status='4',d=>d.adresse.virkningtil='2025-01-01',d=>d.adresse.husnummer.postnummer.postnr='']){const data=fixture();mutate(data);assert.throws(()=>canonicalAddress(data));}
});
test('search only sends bounded address text, not customer details',async()=>{
 let seen;const fetchImpl=async url=>{seen=url;return response({status:'ok',fund:[{id,type:'adresse',titel:'Jagtvej 120, 1. 101, 2200 København N'}]});};
 const result=await searchDanishAddresses({query:'Jagtvej  120',email:'private@example.com'},{fetchImpl,env:{}});
 assert.equal(seen.origin,'https://adressevaelger.dk');assert.equal(seen.searchParams.get('tekst'),'Jagtvej 120');assert.equal(seen.searchParams.has('email'),false);assert.equal(result.suggestions[0].type,'adresse');
 await assert.rejects(searchDanishAddresses({query:'x'.repeat(74)},{fetchImpl}));
});
test('house-number drilldown only returns current apartments',async()=>{
 const result=await searchDanishAddresses({houseId:id},{fetchImpl:async url=>{assert.equal(url.pathname,`/husnumre/${id}/adresser`);return response({status:'ok',adresser:[{id_lokalid:id,status:'3',adressebetegnelse:'1. th'},{status:'4',adressebetegnelse:'deleted'}]});}});
 assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].type,'adresse');
});
test('checkout resolves on the server, rejects changed fields and keeps canonical address metadata',async()=>{
 const canonical=canonicalAddress(fixture()),shipping={...canonical,name:'Test',email:'test@example.dk',phone:'12345678'};
 const options={fetchImpl:async()=>response(fixture())};
 const result=validateDelivery(await verifyDeliveryAddress(shipping,options));assert.equal(result.street,'Jagtvej 120, 1. 101');assert.equal(result.addressId,id);assert.equal(result.addressSource,'DAR');
 for(const field of ['street','city','postalCode'])await assert.rejects(verifyDeliveryAddress({...shipping,[field]:'forged'},options),/ændret/);
 await assert.rejects(verifyDeliveryAddress({...shipping,addressId:''},options),/Vælg/);
 await assert.rejects(verifyDeliveryAddress({...shipping,country:'SE'},options),/Danmark/);
});
test('lookup failures never allow checkout or leak provider errors',async()=>{
 for(const fetchImpl of [async()=>{throw Error('SECRET');},async()=>({ok:false}),async()=>response({status:'error'})])await assert.rejects(resolveDanishAddress(id,{fetchImpl}),e=>e.message.includes('midlertidigt')&&!e.message.includes('SECRET'));
 await assert.rejects(resolveDanishAddress('../../secret'),/Vælg/);
});
test('address request rate limiter expires counters and separates visitors',()=>{
 const allow=createAddressLimiter();for(let i=0;i<90;i++)assert.equal(allow('a',100),true);assert.equal(allow('a',100),false);assert.equal(allow('b',100),true);assert.equal(allow('a',60101),true);
});
