import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';
import {readSignedArtwork} from '../lib/pf-artwork.mjs';
import {buildPFOrder} from '../lib/pf-gateway.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const env={SMERCH_PUBLIC_BASE_URL:'https://smerch.dk',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(40)};
test('each grouped decoration gets its own signed PROOF and missing previews block handoff',async()=>{
 const decoration={method:'Digitaltryk',methodCode:1,positionCode:'front',colors:1,width:85,height:25,artworks:[{logo:{id:'logo'}}]};
 const checkout={id:'pay-11111111-1111-4111-8111-111111111111',status:'authorized',lines:[{decorations:[]},{sku:'38687070',quantity:10,supplierUnitPrice:26,decorations:[decoration,{...decoration,positionCode:'back'}]}],mockups:[{filename:'mockup-2-1.png',base64:png},{filename:'mockup-2-2.png',base64:png}]};
 const assets=pfAssetsForGroup(checkout,{lineIndexes:[1]},{env});
 assert.equal(new URL(assets['0:0'].files.proof).searchParams.get('artwork'),'mockup-1-0');
 assert.equal(new URL(assets['0:1'].files.proof).searchParams.get('artwork'),'mockup-1-1');
 assert.throws(()=>pfAssetsForGroup({...checkout,mockups:checkout.mockups.slice(0,1)},{lineIndexes:[1]},{env}),/Mockup mangler/);
 assert.throws(()=>pfAssetsForGroup({...checkout,mockups:[...checkout.mockups,checkout.mockups[0]]},{lineIndexes:[1]},{env}),/Mockup mangler/);
 const payload=buildPFOrder({messageId:'m',createdAt:new Date().toISOString(),purchaseOrderNumber:'SMERCH-test',currency:'DKK',supplierTotal:99690,shipping:{name:'Test',email:'x@example.invalid',phone:'12345678',address:{street:'Test 1',city:'Test',postalCode:'1000',country:'DK'}},lines:[{...checkout.lines[1],decorations:checkout.lines[1].decorations.map((d,i)=>({...d,...assets['0:'+i]}))}]},{senderId:'S',communicationEmail:'x@example.invalid'});
 assert.deepEqual(payload.Artworks.map(a=>a.ArtworkType),['RAW','PROOF','RAW','PROOF']);
 assert.deepEqual(payload.Decorations.map(d=>d.ArtworkReferenceIDs),[['0','1'],['2','3']]);
 assert.equal(payload.SKUs[0].Eproof,'EPROOF');
 const root=await mkdtemp(join(tmpdir(),'pf-mockup-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{
  await mkdir(join(root,'checkouts'));
  const path=join(root,'checkouts',checkout.id+'.json');await writeFile(path,JSON.stringify(checkout));
  const query=new URL(assets['0:0'].files.proof).searchParams;
  const result=await readSignedArtwork(query,{env});assert.equal(result.mimeType,'image/png');assert.deepEqual(result.data,Buffer.from(png,'base64'));
  const tampered=new URLSearchParams(query);tampered.set('artwork','mockup-0-0');await assert.rejects(readSignedArtwork(tampered,{env}),/ugyldigt/);
  await assert.rejects(readSignedArtwork(query,{env,now:Date.now()+8*86400000}),/udløbet/);
  await writeFile(path,JSON.stringify({...checkout,status:'cancelled'}));await assert.rejects(readSignedArtwork(query,{env}),/ikke tilgængelig/);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
