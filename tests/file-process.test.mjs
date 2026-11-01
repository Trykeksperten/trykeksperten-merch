import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {createFileProcessRunner,runFileTask} from '../lib/file-process.mjs';
const entry=new URL('./helpers/file-process-fixture.mjs',import.meta.url),input=reference=>({files:[{bytes:Buffer.from('synthetic only'),mimeType:'application/pdf'}],reference});
test('file process does not inherit application secrets or permit reads of unrelated private files',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'smerch-file-access-')),privateFile=join(folder,'synthetic-secret.txt');await writeFile(privateFile,'synthetic not a real secret');
 const previous=process.env.SMERCH_SYNTHETIC_SECRET;process.env.SMERCH_SYNTHETIC_SECRET='must not be inherited';
 try{const runner=createFileProcessRunner({entry});const environment=JSON.parse(await runner.run('extract',input('environment')));assert.equal(environment.marker,null);assert.deepEqual(environment.environmentKeys.filter(k=>process.platform!=='darwin'||k!=='__CF_USER_TEXT_ENCODING'),['MALLOC_ARENA_MAX','PATH','UV_THREADPOOL_SIZE']);assert.equal(JSON.parse(await runner.run('extract',input('read:'+privateFile))).denied,true);}finally{if(previous===undefined)delete process.env.SMERCH_SYNTHETIC_SECRET;else process.env.SMERCH_SYNTHETIC_SECRET=previous;await rm(folder,{recursive:true});}
});
test('hung parsing is killed, one waiting job is retained, excess work is rejected and parent HTTP stays healthy',async()=>{
 const runner=createFileProcessRunner({entry,timeoutMs:500,queueMs:2000}),server=createServer((req,res)=>res.end('healthy'));server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const blocked=assert.rejects(runner.run('pdf',input('hang')),{code:'FILE_PROCESS_TIMEOUT'});const next=runner.run('pdf',input('normal'));await assert.rejects(runner.run('pdf',input('third')),{code:'FILE_PROCESS_BUSY'});assert.equal(runner.status().queued,1);const response=await fetch('http://127.0.0.1:'+server.address().port);assert.equal(response.status,200);assert.equal(await response.text(),'healthy');await blocked;assert.deepEqual(await next,{pages:1});}finally{await new Promise(resolve=>server.close(resolve));}
});
test('waiting work expires without allowing a second concurrent process',async()=>{
 const runner=createFileProcessRunner({entry,timeoutMs:400,queueMs:50}),first=assert.rejects(runner.run('pdf',input('hang')),{code:'FILE_PROCESS_TIMEOUT'});await assert.rejects(runner.run('pdf',input('normal')),{code:'FILE_PROCESS_BUSY'});assert.equal(runner.status().active,true);assert.equal(runner.status().queued,0);await first;
});
test('invalid and excessive child output are rejected before caller success',async()=>{
 const runner=createFileProcessRunner({entry});await assert.rejects(runner.run('extract',input('overflow')),{code:'FILE_OUTPUT_LIMIT'});await assert.rejects(runner.run('pdf',input('invalid')),{code:'FILE_PROCESS_FAILED'});await assert.rejects(runner.run('unknown',input('normal')),{code:'FILE_TASK_INVALID'});await assert.rejects(runner.run('constructor',input('normal')),{code:'FILE_TASK_INVALID'});await assert.rejects(runner.run('pdf',{files:[{bytes:Buffer.alloc(11*1024*1024),mimeType:'application/pdf'}]}),{code:'FILE_INPUT_LIMIT'});
});
test('the actual Linux launcher rejects external Buffer allocations without aborting the parent',{skip:process.platform!=='linux'},async()=>{
 const runner=createFileProcessRunner({entry});const result=JSON.parse(await runner.run('extract',input('allocate')));assert.equal(result.denied,true);assert.ok(result.maxRSSKiB<192*1024);
});
test('PDF/image validation and multi-file merge keep originals unchanged and reject invalid or excessive data',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([100,100]);const bytes=Buffer.from(await pdf.save()),original=Buffer.from(bytes),file={bytes,mimeType:'application/pdf'};
 assert.deepEqual(await runFileTask('pdf',{files:[file]}),{pages:1});const merged=await runFileTask('merge',{files:[file,file]});assert.equal((await PDFDocument.load(merged)).getPageCount(),2);assert.deepEqual(bytes,original);
 const active=await PDFDocument.create();active.addPage();active.addJavaScript('synthetic-check','void(0)');await assert.rejects(runFileTask('pdf',{files:[{bytes:Buffer.from(await active.save()),mimeType:'application/pdf'}],active:true}),{code:'FILE_ACTIVE'});
 const bomb=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bomb);bomb.writeUInt32BE(100000,16);bomb.writeUInt32BE(100000,20);await assert.rejects(runFileTask('image',{files:[{bytes:bomb,mimeType:'image/png'}]}),{code:'FILE_PIXELS'});
 await assert.rejects(runFileTask('pdf',{files:[{bytes:Buffer.from('%PDF-invalid'),mimeType:'application/pdf'}]}),{code:'FILE_PROCESS_FAILED'});
});

// A real native canvas failure must remain in the bounded child, never the parent.
test('Linux native canvas allocation failure leaves the parent and next parsing job usable',{skip:process.platform!=='linux'},async()=>{
 const runner=createFileProcessRunner({entry});assert.deepEqual(await runner.run('pdf',input('normal')),{pages:1});
 try{const result=JSON.parse(await runner.run('extract',input('native')));assert.equal(result.denied,true);}catch(e){assert.equal(e.code,'FILE_PROCESS_FAILED');}
 assert.deepEqual(await runner.run('pdf',input('normal')),{pages:1});
});
