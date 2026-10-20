import test from 'node:test';
import assert from 'node:assert/strict';
import {orderMockups} from '../lib/order-mockups.mjs';
import {queueOrderConfirmation,retryOrderConfirmations} from '../lib/order-mail.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('mockups only accept bounded PNG data for an actual ordered placement',()=>{
 const lines=[{decorations:[{}]}],item={lineIndex:0,decorationIndex:0,base64:png};
 assert.equal(orderMockups([item],lines).length,1);
 for(const invalid of [{...item,lineIndex:1},{...item,decorationIndex:1},{...item,base64:'https://example.com/image.png'},{...item,base64:'A'.repeat(3*1024*1024)}])assert.deepEqual(orderMockups([invalid],lines),[]);
});
test('confirmation delivers thank-you copy, named product, preview and legal attachments once',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-mail-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{
 const lines=[{quantity:10,productName:'Lexi drikkeflaske',sku:'10069501',decorations:[{}]}];
 await queueOrderConfirmation({id:'pay-'+randomUUID(),status:'authorized',totalIncVat:222250,lines,mockups:orderMockups([{lineIndex:0,decorationIndex:0,base64:png}],lines),shipping:{email:'test@example.invalid'},legal:{locale:'da',documents:{terms:'Terms',privacy:'Privacy'}}});
 const sent=[],transport={sendMail:async message=>sent.push(message)};
 await retryOrderConfirmations({transport});await retryOrderConfirmations({transport});
 assert.equal(sent.length,1);assert.match(sent[0].text,/Tak for din ordre!/);assert.match(sent[0].text,/10 × Lexi drikkeflaske/);assert.match(sent[0].text,/Denne korrektur skal godkendes af dig/);assert.match(sent[0].text,/ikke den endelige produktionskorrektur/);
 assert.equal(sent[0].attachments.length,3);assert.deepEqual(sent[0].attachments[0].content,Buffer.from(png,'base64'));assert.equal(sent[0].disableFileAccess,true);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
