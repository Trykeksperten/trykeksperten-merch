import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {savePFConfirmation,readPFConfirmation} from '../lib/pf-confirmations.mjs';
test('supplier PDF stays in private separate storage and rejects invalid files and missing orders',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pf-confirmations-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{const id='ord-00000000-0000-4000-8000-000000000000';await mkdir(join(root,'orders'));await writeFile(join(root,'orders',id+'.json'),JSON.stringify({id}));
 await assert.rejects(()=>savePFConfirmation(id,{contentBase64:Buffer.from('not PDF').toString('base64')}));
 const contentBase64=Buffer.from('%PDF-1.4\ninternal supplier cost').toString('base64');await savePFConfirmation(id,{name:'PF.pdf',contentBase64});assert.equal((await readPFConfirmation(id)).contentBase64,contentBase64);
 await assert.rejects(()=>readPFConfirmation('../orders'));
 await assert.rejects(()=>savePFConfirmation('ord-00000000-0000-4000-8000-000000000001',{contentBase64}));
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
