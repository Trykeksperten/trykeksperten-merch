import test from 'node:test';
import assert from 'node:assert/strict';
import {bindTestSubmission} from '../dist/pf-test-submit.mjs';
function setup({payload=async()=>({}),api=async()=>({json:async()=>({id:'one',purchaseOrderNumber:'TEST-1',status:'gateway_accepted'})}),show=async()=>{},authenticated=true}={}){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='test-source'?'cart':id==='test-confirmation'?'TEST':'value',textContent:'',addEventListener(){},setAttribute(){},removeAttribute(){},focus(){this.focused=true;}});return nodes.get(id);};let calls=0;
 bindTestSubmission({$,cartTest:{payload},api:async(...args)=>{if(args[0]==='/api/admin/session')return {json:async()=>({authenticated})};calls++;return api(...args);},refresh:async()=>{},show,labels:{}});
 return {$,send:()=>$('gateway-test-form').onsubmit({preventDefault(){}}),calls:()=>calls};
}
test('confirmation and Pantone failures are local and never send',async()=>{
 const x=setup({payload:async()=>{throw Error('Bekræft Pantone-farvekoder');}});
 x.$('test-confirmation').value='TEST TEST TEST';await x.send();assert.match(x.$('test-feedback').textContent,/Skriv kun TEST/);assert.equal(x.calls(),0);
 x.$('test-confirmation').value='TEST';await x.send();assert.match(x.$('test-feedback').textContent,/Bekræft Pantone/);assert.equal(x.calls(),0);assert.equal(x.$('send-gateway-test').disabled,false);
});
test('busy submission cannot create duplicates and shows success',async()=>{
 let resolve;const x=setup({payload:()=>new Promise(r=>resolve=r)});const pending=x.send();await x.send();await new Promise(r=>setImmediate(r));assert.equal(x.calls(),0);assert.equal(x.$('send-gateway-test').disabled,true);resolve({});await pending;assert.equal(x.calls(),1);assert.match(x.$('test-feedback').textContent,/TEST-1.*modtaget/);assert.equal(x.$('test-confirmation').value,'');
});
test('successful send remains clear if detail rendering fails',async()=>{
 const x=setup({show:async()=>{throw Error('offline')}});await x.send();assert.equal(x.calls(),1);assert.match(x.$('test-feedback').textContent,/modtaget.*Ordrevisningen/);
});

test('expired login preserves form and never prepares or sends files',async()=>{let prepared=false;const x=setup({authenticated:false,payload:async()=>{prepared=true;}});await x.send();assert.equal(prepared,false);assert.equal(x.calls(),0);assert.equal(x.$('test-confirmation').value,'TEST');assert.equal(x.$('test-login-link').hidden,false);assert.match(x.$('test-feedback').textContent,/login er udløbet/);});
