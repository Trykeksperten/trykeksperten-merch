import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canReceiveProof} from '../dist/proof-upload.mjs';
import {recordProof} from '../lib/pf-orders.mjs';
import {proofPdf} from './helpers/proof-pdf.mjs';
test('PF processing before proof does not hide receiving a proof; shipment/cancellation/approval still block recovery',()=>{
 const pending={status:'needs_attention',pfStatus:'PROCESSING',pfOrderNumber:7886901};
 assert.equal(canReceiveProof(pending),true);
 assert.equal(canReceiveProof({...pending,pfStatus:'STALLED'}),true);
 for(const change of [{pfOrderNumber:null},{pfStatus:'CANCELLED'},{pfStatus:'SHIPPED'},{shipment:{shipDate:'2026-10-23'}},{proof:{approvalReference:'PF-OK'}},{status:'cancelled'},{status:'shipped'}])assert.equal(canReceiveProof({...pending,...change}),false);
});
test('receive actual PDF after early PF processing without changing checkout or approving production',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-receive-proof-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{const id='ord-'+randomUUID(),checkoutId='pay-'+randomUUID(),checkout={id:checkoutId,status:'authorized',totalIncVat:124613};
 await mkdir(join(root,'orders'));await mkdir(join(root,'checkouts'));
 await writeFile(join(root,'checkouts',checkoutId+'.json'),JSON.stringify(checkout));
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify({id,checkoutId,status:'needs_attention',pfStatus:'PROCESSING',pfOrderNumber:7886901,events:[]}));
 const order=await recordProof(id,{proofReference:'7886901-PDF-1',mimeType:'application/pdf',contentBase64:(await proofPdf('PF proof')).toString('base64')});
 assert.equal(order.status,'proof_received');assert.equal(order.proof.version,1);assert.equal(order.proof.customer,undefined);assert.equal(order.proof.approvalReference,undefined);assert.equal(order.decision,null);
 assert.deepEqual(JSON.parse(await readFile(join(root,'checkouts',checkoutId+'.json'))),checkout);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
