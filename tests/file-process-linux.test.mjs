import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PDFDocument,StandardFonts} from 'pdf-lib';
// Synthetic Linux preflight only. This does not activate a production parser.
const launcher=String.raw`
import os,sys,resource
cap=int(sys.argv[3])*1024*1024
resource.setrlimit(resource.RLIMIT_AS,(cap,cap))
resource.setrlimit(resource.RLIMIT_DATA,(192*1024*1024,192*1024*1024))
resource.setrlimit(resource.RLIMIT_CPU,(8,9))
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
os.execve(sys.argv[1],[sys.argv[1],'--jitless','--max-old-space-size=96','--v8-pool-size=1','-e',sys.argv[2]],{'PATH':os.environ['PATH'],'UV_THREADPOOL_SIZE':'1','MALLOC_ARENA_MAX':'1'})
`;
const program=String.raw`
(async()=>{
 const chunks=[];for await(const c of process.stdin)chunks.push(c);const input=Buffer.concat(chunks);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {createCanvas}=require('@napi-rs/canvas');
 const task=getDocument({data:new Uint8Array(input),isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,standardFontDataUrl:require('node:path').dirname(require.resolve('pdfjs-dist/package.json'))+'/standard_fonts/'});
 const pdf=await task.promise,page=await pdf.getPage(1),viewport=page.getViewport({scale:3}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
 await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
 const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,300).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180)ink++;
 const pngBytes=canvas.toBuffer('image/png').length;await task.destroy();
 let allocationDenied=false;try{Buffer.alloc(1024*1024*1024);}catch{allocationDenied=true;}
 const limits=require('node:fs').readFileSync('/proc/self/limits','utf8'),address=Number(/^Max address space\s+(\d+)/m.exec(limits)?.[1]);
 process.stdout.write('SMERCH_RESOURCE_RESULT '+JSON.stringify({pngBytes,ink,allocationDenied,address,maxRSSKiB:process.resourceUsage().maxRSS,environmentKeys:Object.keys(process.env).sort()})+'\n');
})().catch(()=>process.exitCode=1);
`;
async function probe(cap,input){
 return new Promise(resolve=>{
  const child=spawn('python3',['-I','-S','-c',launcher,process.execPath,program,String(cap)],{env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});
  let output='',diagnostic='',overflow=false;child.stderr.on('data',chunk=>{if(diagnostic.length<4096)diagnostic+=chunk.toString().slice(0,4096-diagnostic.length);});const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
  child.stdout.on('data',chunk=>{if(output.length+chunk.length>16384){overflow=true;child.kill('SIGKILL');}else output+=chunk;});
  child.stdin.on('error',()=>{});child.once('error',()=>{});child.once('close',(code,signal)=>{clearTimeout(timer);const line=output.split('\n').find(s=>s.startsWith('SMERCH_RESOURCE_RESULT '));let result=null;try{if(line)result=JSON.parse(line.slice(23));}catch{}resolve({capMiB:cap,dataLimitMiB:192,code,signal,overflow,result,diagnostic:result?null:diagnostic.split('\n').slice(0,5).join(' | ')});});
  child.stdin.end(input);
 });
}
test('Linux preflight: native PDF rendering and rejected oversized allocation under an OS address-space limit',{skip:process.platform!=='linux',timeout:80000},async t=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([595,842]);page.drawText('SMERCH synthetic isolation test',{x:40,y:780,size:12,font});const input=await pdf.save();
 const results=[];for(const cap of [256,384,768,1536])results.push(await probe(cap,input));
 t.diagnostic(JSON.stringify({syntheticResourceProbes:results}));
 const successful=results.filter(r=>r.code===0&&r.result);
 assert.ok(successful.length,'No bounded profile could render the synthetic PDF. Do not wire production processing.');
 for(const row of successful){assert.equal(row.result.address,row.capMiB*1024*1024);assert.equal(row.result.allocationDenied,true);assert.ok(row.result.pngBytes>100);assert.ok(row.result.ink>100);assert.deepEqual(row.result.environmentKeys,['MALLOC_ARENA_MAX','PATH','UV_THREADPOOL_SIZE']);assert.ok(row.result.maxRSSKiB<row.capMiB*1024);assert.equal(row.overflow,false);}
});
