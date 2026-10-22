import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,rm} from 'node:fs/promises';
import {dataPath} from '../lib/data-path.mjs';
import {saveCompanyProduct,listCompanyProducts,companySelection,resolveCompanyCart,archiveCompanyProduct,companyProductPreview} from '../lib/company-products.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {normalizeArtworkForOption,designGroupSize} from '../dist/design-layers.mjs';
import {persistCheckoutArtwork} from '../lib/checkout.mjs';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';

test('company designs keep original files server-side, reject other accounts and attach trusted artwork to PF checkout',async()=>{
 const company={id:'test-'+randomUUID()},other={id:'other-'+randomUUID()},product=await loadPFProduct('pf-37538'),source=product.variants[0],option=source.options[0];
 const pdf=Buffer.from('%PDF-1.4\nOriginal customer artwork'),logo={id:randomUUID(),name:'customer.pdf',type:'application/pdf',size:pdf.length,pixelWidth:1000,pixelHeight:1000};
 const art=normalizeArtworkForOption({id:randomUUID(),logo,x:.5,y:.5,scale:.4,paletteColors:[{source:'#000000',target:'#000000'}]},option),size=designGroupSize([art],'',{},option);
 const line={productId:product.id,sku:source.sku,quantity:25,decorations:[{optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'',artworks:[art]}]};
 const catalog={products:[product]},loadCatalog=async()=>catalog,previews=['iVBORw0KGgo='];
 let checkoutId;
 try{
  await assert.rejects(saveCompanyProduct(company.id,{line,artworks:[],previews},{catalog}),/logofiler/);
  const item=await saveCompanyProduct(company.id,{name:'Fixed design',line,artworks:[{id:logo.id,base64:pdf.toString('base64')}],previews},{catalog});
  assert.ok(item.variants.some(v=>v.sku===source.sku));assert.ok(item.variants.length>1);const second=item.variants.find(v=>v.sku!==source.sku);const sizes=await companySelection(company,{id:item.id,revision:item.revision,quantities:{[source.sku]:3,[second.sku]:4}},{loadCatalog});assert.deepEqual(sizes.lines.map(l=>l.quantity),[3,4]);assert.equal(item.files[0].name,'customer.pdf');assert.ok(!JSON.stringify(item).includes('base64'));
  assert.equal((await listCompanyProducts(company.id)).length,1);assert.equal((await listCompanyProducts(other.id)).length,0);
  await assert.rejects(companySelection(null,{id:item.id,revision:item.revision,quantities:{[source.sku]:2}},{loadCatalog}),/Log ind/);
  await assert.rejects(companySelection(other,{id:item.id,revision:item.revision,quantities:{[source.sku]:2}},{loadCatalog}));
  await assert.rejects(companySelection(company,{id:item.id,revision:item.revision,quantities:{evil:2}},{loadCatalog}),/Størrelsen/);
  await assert.rejects(companySelection(company,{id:item.id,revision:'stale',quantities:{[source.sku]:2}},{loadCatalog}),/opdateret/);
  const selection=await companySelection(company,{id:item.id,revision:item.revision,quantities:{[source.sku]:3}},{loadCatalog});
  assert.equal(selection.artworks.length,0);
  const altered={...selection.lines[0],productId:'attacker',decorations:[]};
  const resolved=await resolveCompanyCart([altered],company,{loadCatalog,includeFiles:true});
  assert.equal(resolved.lines[0].productId,product.id);assert.equal(resolved.lines[0].quantity,3);assert.equal(resolved.lines[0].decorations.length,1);assert.equal(resolved.artworks[0].base64,pdf.toString('base64'));
  checkoutId='pay-'+randomUUID();const checkout={id:checkoutId,lines:resolved.lines};await persistCheckoutArtwork(checkout,resolved.artworks);
  assert.deepEqual(await readFile(checkout.artworks[0].path),pdf);
  assert.throws(()=>pfAssetsForGroup(checkout,{lineIndexes:[0]},{env:{SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(40),SMERCH_PUBLIC_BASE_URL:'https://api.example',SMERCH_PMS_COLOR_MAP:'{\"#000000\":\"Black C\"}'}}),/manuelt/);
  checkout.pfColourOverrides={'0:0':['Black C']};
  const assets=pfAssetsForGroup(checkout,{lineIndexes:[0]},{env:{SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(40),SMERCH_PUBLIC_BASE_URL:'https://api.example',SMERCH_PMS_COLOR_MAP:'{"#000000":"Black C"}'}});
  const url=new URL(assets['0:0'].files.raw[0]);assert.equal(url.searchParams.get('artwork'),checkout.artworks[0].id);assert.equal(url.searchParams.get('checkout'),checkoutId);
  assert.ok((await companyProductPreview(company.id,item.id,0)).length>0);
  await archiveCompanyProduct(company.id,item.id);assert.equal((await listCompanyProducts(company.id)).length,0);
  await assert.rejects(companySelection(company,{id:item.id,revision:item.revision,quantities:{[source.sku]:2}},{loadCatalog}),/tilgængeligt/);
 }finally{await rm(dataPath('company-products',company.id),{recursive:true,force:true});if(checkoutId)await rm(dataPath('checkouts',checkoutId),{recursive:true,force:true});}
});
