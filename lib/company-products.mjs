import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {dataPath} from './data-path.mjs';
import {sanitizeDesignLine} from './design-validation.mjs';
import {selectionLines,variantColorKey} from '../dist/product-selection.mjs';
import {persistCheckoutArtwork} from './checkout.mjs';

const validId=value=>typeof value==='string'&&/^[a-z0-9-]{1,80}$/.test(value);
function folder(companyId){if(!validId(companyId))throw Error('Ugyldig virksomhed.');return dataPath('company-products',companyId);}
function location(companyId,id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Ugyldigt produkt.');return join(folder(companyId),id+'.json');}
export async function readCompanyProduct(companyId,id){const item=JSON.parse(await readFile(location(companyId,id),'utf8'));if(item.companyId!==companyId||item.id!==id||item.active===false)throw Error('Virksomhedsproduktet er ikke længere tilgængeligt.');return item;}
function publicItem(item){return {id:item.id,name:item.name,productId:item.line.productId,companyId:item.companyId,revision:item.revision,image:item.image,variants:item.variants,placements:item.line.decorations.map(d=>({method:d.method,position:d.position,width:d.width,height:d.height})),files:item.files.map(file=>({name:file.name,size:file.size})),previews:(item.previews||[]).map((_,i)=>i),createdAt:item.createdAt};}
export async function listCompanyProducts(companyId){let names;try{names=await readdir(folder(companyId));}catch(error){if(error.code==='ENOENT')return [];throw error;}const items=[];for(const name of names.filter(name=>/^[a-f0-9-]{36}\.json$/.test(name))){const item=JSON.parse(await readFile(join(folder(companyId),name),'utf8'));if(item.active!==false)items.push(publicItem(item));}return items.sort((a,b)=>a.name.localeCompare(b.name,'da'));}
async function saveItem(item){const file=location(item.companyId,item.id);await mkdir(folder(item.companyId),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(item),{mode:0o600});await rename(temp,file);}
export async function saveCompanyProduct(companyId,input,{catalog}={}){
 const line=sanitizeDesignLine(catalog,input.line),product=catalog.products.find(p=>p.id===line.productId),source=product.variants.find(v=>v.sku===line.sku);
 const name=String(input.name||product.name).trim().slice(0,200);if(!name)throw Error('Angiv produktets navn.');
 if(!line.decorations.length)throw Error('Gem et produkt med de færdige trykplaceringer og filer.');
 // Reuse the checkout file validator, then retain durable copies outside the web root.
 const staging={id:'pay-'+randomUUID(),lines:[line]};let files;
 try{await persistCheckoutArtwork(staging,input.artworks);files=await Promise.all(staging.artworks.map(async asset=>({id:asset.id,name:asset.name,type:asset.type,size:asset.size,base64:(await readFile(asset.path)).toString('base64')})));}finally{await rm(dataPath('checkouts',staging.id),{recursive:true,force:true});}
 const id=randomUUID(),ids=new Map(files.map(file=>[file.id,randomUUID()]));
 for(const deco of line.decorations){for(const art of deco.artworks)art.logo.id=ids.get(art.logo.id);if(deco.logo)deco.logo.id=ids.get(deco.logo.id)||deco.artworks[0]?.logo.id;}
 files=files.map(file=>({...file,id:ids.get(file.id)}));
 const variants=[];
 for(const variant of product.variants.filter(v=>!v.discontinued&&variantColorKey(v)===variantColorKey(source))){try{const [target]=selectionLines(product,source,line,[{variant,quantity:line.quantity}]);sanitizeDesignLine(catalog,target);variants.push({sku:variant.sku,size:variant.size||'Standard',color:variant.color||''});}catch{}}
 if(!variants.length)throw Error('Designet passer ikke til nogen aktive størrelser.');
 const previews=Array.isArray(input.previews)?input.previews:[];if(previews.length!==line.decorations.length||previews.some(value=>typeof value!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)||value.length>3*1024*1024))throw Error('Der skal følge et PNG-mockup med hver trykplacering.');
 const item={id,companyId,previews,revision:randomUUID(),active:true,name,line,files,variants,image:source.images?.[0]||'',createdAt:new Date().toISOString()};await saveItem(item);return publicItem(item);
}
export async function archiveCompanyProduct(companyId,id){const item=await readCompanyProduct(companyId,id);item.active=false;await saveItem(item);}
export async function companySelection(company,input,{loadCatalog,includeFiles=false}={}){
 if(!company)throw Error('Log ind på virksomhedssiden for at genbestille.');
 const item=await readCompanyProduct(company.id,input.id);
 if(input.revision!==item.revision)throw Error('Designet er opdateret. Vælg produktet igen på virksomhedssiden.');
 const selections=input.quantities;if(!selections||typeof selections!=='object'||Array.isArray(selections))throw Error('Vælg størrelser og antal.');
 const catalog=await loadCatalog([item.line.productId]),product=catalog.products.find(p=>p.id===item.line.productId),source=product?.variants.find(v=>v.sku===item.line.sku);if(!source)throw Error('Produktet findes ikke længere.');
 const rows=[];
 for(const [sku,value]of Object.entries(selections)){const quantity=Number(value);if(!Number.isInteger(quantity)||quantity<0||quantity>100000)throw Error('Angiv hele antal mellem 0 og 100.000.');if(!quantity)continue;const variant=product.variants.find(v=>v.sku===sku&&!v.discontinued);if(!variant||!item.variants.some(v=>v.sku===sku))throw Error('Størrelsen er ikke en del af virksomhedens sortiment.');rows.push({variant,quantity});}
 if(!rows.length||rows.length>20||rows.reduce((n,r)=>n+r.quantity,0)>100000)throw Error('Vælg 1–20 størrelser og højst 100.000 stk.');
 const lines=selectionLines(product,source,item.line,rows).map(line=>({...sanitizeDesignLine(catalog,line),companyTemplate:{id:item.id,revision:item.revision}}));
 return {lines,artworks:includeFiles?item.files.map(file=>({id:file.id,base64:file.base64})):[],reference:{id:item.id,revision:item.revision}};
}
export async function resolveCompanyCart(lines,company,{loadCatalog,includeFiles=false}={}){
 if(!Array.isArray(lines)||lines.length>100)throw Error('Ugyldig kurv.');
 const resolved=[],artworks=new Map(),references=[];
 for(const line of lines){if(!line?.companyTemplate){resolved.push(line);continue;}
  const result=await companySelection(company,{...line.companyTemplate,quantities:{[line.sku]:line.quantity}},{loadCatalog,includeFiles});resolved.push(result.lines[0]);for(const file of result.artworks)artworks.set(file.id,file);references.push(result.reference);
 }
 return {lines:resolved,artworks:[...artworks.values()],references};
}

export async function companyProductPreview(companyId,id,index){const item=await readCompanyProduct(companyId,id);if(!Number.isInteger(index)||index<0||index>=item.previews.length)throw Error('Mockuppet findes ikke.');return Buffer.from(item.previews[index],'base64');}
