import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName} from 'pdf-lib';
import {parseArtworkPantone} from '../lib/artwork-pantone-parser.mjs';
import {inspectArtworkPantone,decorationPantone} from '../lib/artwork-pantone.mjs';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';
import {persistCheckoutArtwork} from '../lib/checkout.mjs';
import {rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
async function pdf(content='/Spot cs 1 scn 0 0 20 20 re f',spot='PANTONE 186 C',second=false){
 const doc=await PDFDocument.create(),page=doc.addPage([100,100]),ctx=doc.context;
 const make=value=>ctx.obj([PDFName.of('Separation'),PDFName.of(value),PDFName.of('DeviceCMYK'),ctx.obj({FunctionType:2,Domain:[0,1],C0:[0,0,0,0],C1:[0,1,1,0],N:1})]);
 page.node.set(PDFName.of('Resources'),ctx.obj({ColorSpace:{Spot:make(spot),Unused:make('PANTONE 999 C')}}));
 page.node.set(PDFName.of('Contents'),ctx.register(ctx.flateStream(content)));
 doc.setTitle('PANTONE 123 C');if(second)doc.addPage();return Buffer.from(await doc.save());
}
test('reads actual named spot paint from compressed PDF, excludes unused swatches and metadata',async()=>{
 assert.deepEqual(await parseArtworkPantone(await pdf()),{version:1,status:'verified',codes:['186 C']});
 const result=await inspectArtworkPantone(await pdf());assert.equal(result.status,'verified');assert.match(result.sha256,/^[a-f0-9]{64}$/);
});
test('process colour, text, XObjects, DeviceN/unknown names and multiple pages require review',async()=>{
 for(const content of ['0 0 0 rg 0 0 20 20 re f','/Spot cs 1 scn 0 0 20 20 re f 0 g 0 0 1 1 re f','BT (PANTONE 186 C) Tj ET','/Image Do','/Spot cs 1 scn','q /Spot cs 1 scn 0 0 20 20 re f'])assert.equal((await parseArtworkPantone(await pdf(content))).status,'manual');
 for(const spot of ['186 C','PANTONE 186 U','PANTONE 18-1664 TCX'])assert.equal((await parseArtworkPantone(await pdf(undefined,spot))).status,'manual');
 assert.equal((await parseArtworkPantone(await pdf(undefined,undefined,true))).status,'manual');
});
test('colour state restoration cannot silently hide a process colour',async()=>{
 assert.equal((await parseArtworkPantone(await pdf('0 g q /Spot cs 1 scn 0 0 20 20 re f Q 0 0 10 10 re f'))).status,'manual');
});
test('PostScript spot declarations are candidates only; arbitrary text cannot provide colours',async()=>{
 assert.deepEqual((await parseArtworkPantone(Buffer.from('%!PS\n%%CMYKCustomColor: 0 1 1 0 (PANTONE 186 C)'))),{version:1,status:'manual',codes:['186 C']});
 assert.deepEqual((await parseArtworkPantone(Buffer.from('%!PS\n(PANTONE 186 C) show'))).codes,[]);
 assert.equal((await inspectArtworkPantone(Buffer.from('%PDF-broken'))).status,'manual');
});
test('only server original analysis supplies PF codes; added text, missing files and colour count fail closed',async()=>{
 const logo={id:randomUUID(),name:'art.ai',type:'application/illustrator'},bytes=await pdf();logo.size=bytes.length;
 const deco={method:'Screenprint',colors:1,artworks:[{logo}]},order={mockups:[{filename:'mockup-1-1.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}],id:`pay-${randomUUID()}`,lines:[{decorations:[deco]}]},group={lineIndexes:[0]},env={SMERCH_PUBLIC_BASE_URL:'https://smerch.dk',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(40)};
 try{
  logo.pantone={status:'verified',codes:['123 C']};assert.throws(()=>pfAssetsForGroup(order,group,{env}),/Pantone/);
  await persistCheckoutArtwork(order,[{id:logo.id,base64:bytes.toString('base64')}]);
  assert.deepEqual(pfAssetsForGroup(order,group,{env})['0:0'].pmsColors,['186 C']);
  assert.equal(decorationPantone({...deco,text:'Added'},order.artworks).status,'manual');
  assert.equal(decorationPantone({...deco,colors:2},order.artworks).status,'manual');
  assert.equal(decorationPantone(deco,[]).status,'manual');
  order.pfColourOverrides={'0:0':['Black C']};assert.deepEqual(pfAssetsForGroup(order,group,{env})['0:0'].pmsColors,['Black C']);
  delete order.pfColourOverrides;deco.artworks[0].color='#ffffff';assert.throws(()=>pfAssetsForGroup(order,group,{env}),/ændret/);delete deco.artworks[0].color;
  order.artworks[0].pantone.codes=['871 C'];assert.throws(()=>pfAssetsForGroup(order,group,{env}),/metallic/);
 }finally{await rm(new URL(`../.private/checkouts/${order.id}/`,import.meta.url),{recursive:true,force:true});}
});

test('HTTP upload analysis verifies bytes and rejects other origins without storing an order',async()=>{
 const {spawn}=await import('node:child_process'),{mkdtemp,readdir}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{once}=await import('node:events'),{fileURLToPath}=await import('node:url');
 const root=await mkdtemp(join(tmpdir(),'smerch-pantone-http-'));
 const {createServer}=await import('node:net'),probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),HOST:'127.0.0.1',SMERCH_PUBLIC_BASE_URL:base,SMERCH_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors||'Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server did not start')),10000).unref())]);
  const body={base64:(await pdf()).toString('base64'),codes:['123 C'],status:'verified'};
  const post=origin=>fetch(base+'/api/artwork/pantone',{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  assert.equal((await post('https://other.example')).status,403);
  const result=await post(base);assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'verified',codes:['186 C']});
  assert.ok(!(await readdir(root)).includes('checkouts'));
 }finally{if(child.exitCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}await rm(root,{recursive:true,force:true});}
});
