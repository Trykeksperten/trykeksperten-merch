import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {persistCheckoutArtwork,persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {readCheckoutArtwork} from '../lib/checkout-artwork.mjs';
import {artworkURL,readSignedArtwork} from '../lib/pf-artwork.mjs';
import {saveTestArtwork} from '../lib/pf-test-artwork.mjs';
import {createBackup,restoreBackup} from '../lib/data-backup.mjs';
import {closeDatabases} from '../lib/backoffice/database.mjs';

const signing={SMERCH_PUBLIC_BASE_URL:'https://example.test',SMERCH_ARTWORK_SIGNING_SECRET:'synthetic-restore-signing-key-only-123456'};
async function syntheticArtwork(id){
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
 const logo={id:randomUUID(),name:'synthetic.pdf',type:'application/pdf',size:bytes.length};
 const order={id,status:'authorized',createdAt:'2026-01-01T12:00:00Z',events:[],
  shipping:{name:'Synthetic customer',email:'restore@example.test'},
  lines:[{sku:'RESTORE',quantity:1,decorations:[{artworks:[{logo}]}]}],
  quote:{lines:[{net:100,vat:25}]},totalIncVat:125};
 await persistCheckoutArtwork(order,[{id:logo.id,base64:bytes.toString('base64')}]);
 return {order,bytes,logo};
}

async function isolated(fn){
 const root=await mkdtemp(join(tmpdir(),'smerch-artwork-restore-'));
 const previous={dir:process.env.SMERCH_DATA_DIR,db:process.env.SMERCH_DATABASE_ENABLED};
 process.env.SMERCH_DATA_DIR=join(root,'source');await mkdir(process.env.SMERCH_DATA_DIR);
 try{await fn(root);}finally{
  closeDatabases();
  if(previous.dir===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous.dir;
  if(previous.db===undefined)delete process.env.SMERCH_DATABASE_ENABLED;else process.env.SMERCH_DATABASE_ENABLED=previous.db;
  await rm(root,{recursive:true,force:true});
 }
}

for(const storage of ['JSON','SQLite'])for(const format of ['relative','legacy absolute']){
 test(`${storage} restore reads copied artwork with ${format} references while original directory is unavailable`,()=>isolated(async root=>{
  process.env.SMERCH_DATABASE_ENABLED=storage==='SQLite'?'1':'0';
  const {order,bytes,logo}=await syntheticArtwork('pay-'+randomUUID());
  const source=process.env.SMERCH_DATA_DIR,reference=order.artworks[0].path;
  assert.equal(reference,`checkouts/${order.id}/0`);assert.equal(isAbsolute(reference),false);
  if(format==='legacy absolute')order.artworks[0].path=join(source,reference);
  await persistCheckout(order);
  const query=new URL(artworkURL(order.id,logo.id,{env:signing})).searchParams;
  assert.deepEqual((await readSignedArtwork(query,{env:signing})).data,bytes);
  closeDatabases();
  const backup=join(root,'backup'),restored=join(root,'restored');
  await createBackup(source,backup);await restoreBackup(backup,restored);
  // Keep the source bytes intact, but make their original location unavailable.
  await rename(source,join(root,'source-preserved'));
  process.env.SMERCH_DATA_DIR=restored;
  const recovered=await readCheckout(order.id);
  assert.equal(recovered.artworks[0].path,order.artworks[0].path);
  assert.deepEqual(await readFile(join(restored,reference)),bytes);
  assert.deepEqual(await readCheckoutArtwork(recovered.id,recovered.artworks[0]),bytes);
  assert.deepEqual((await readSignedArtwork(query,{env:signing})).data,bytes);
  assert.deepEqual(await readFile(join(root,'source-preserved',reference)),bytes);
 }));
}

test('restored PF test artwork uses its copied file without contacting PF',()=>isolated(async root=>{
 process.env.SMERCH_DATABASE_ENABLED='0';
 const {order,bytes,logo}=await syntheticArtwork('test-'+randomUUID());
 order.status='ready';order.orderId='ord-'+randomUUID();await saveTestArtwork(order);
 const source=process.env.SMERCH_DATA_DIR,backup=join(root,'backup'),restored=join(root,'restored');
 await createBackup(source,backup);await restoreBackup(backup,restored);await rename(source,join(root,'source-preserved'));
 process.env.SMERCH_DATA_DIR=restored;
 const query=new URL(artworkURL(order.id,logo.id,{env:signing})).searchParams;
 assert.deepEqual((await readSignedArtwork(query,{env:signing})).data,bytes);
}));
