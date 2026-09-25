import {readFile,writeFile,rename,mkdir,rm} from 'node:fs/promises';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {brands} from '../lib/brands.mjs';
import {curatedProducts} from '../lib/curated-products.mjs';
import {pfCatalogShard} from '../lib/pf-catalog-store.mjs';
import {insulationStatus} from '../dist/pf-filters.mjs';
const zip=promisify(gzip);
const clean=s=>String(s||'').toLowerCase().replace(/[®™]/g,'').trim();
const wanted=new Map(brands.map(b=>[clean(b.name),b]));
const slug=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'andet';
const knownBrands=new Map(brands.map(brand=>[clean(brand.name),brand]));
knownBrands.set(clean('Trykeksperten Select'),{id:'trykeksperten-select',name:'Trykeksperten Select',group:'Kontor og gaver',focus:'Udvalgte kvalitetsprodukter',description:'Et kurateret udvalg med fokus på kvalitet, funktion og et enkelt udtryk.',logo:null,status:'available',connected:true});
const list=x=>Array.isArray(x)?x:x?[x]:[];
const nested=(x,key)=>list(x).flatMap(y=>list(y[key]));
const dir=process.argv[2]||'/tmp';
const read=async name=>JSON.parse(await readFile(`${dir}/${name}.json`,'utf8'));
const sources=['productfeed_dk_v3','productfeedws_dk_v3'];
const printSources=['printdata_cse1_dk_v3','printdata_cse1_dk_label_v3','printdataws_cse1_dk_v3'];
const prints=new Map(),timestamps=[];
for(const source of printSources){
 const doc=await read(source);
 for(const feed of list(doc.PFCPrintFeed.printfeed)){
  timestamps.push({source,date:feed.creationDateTime});
  const rows=new Map(nested(feed.printFeedRows,'printFeedRow').map(r=>[String(r.ref),r]));
  for(const model of nested(feed.models,'model'))for(const item of nested(model.items,'item')){
   const options=nested(item.printfeedrefs,'printfeedref').map(ref=>{
    const r=rows.get(String(ref.ref));if(!r)throw Error(`Unresolved print reference ${item.itemCode}:${ref.ref}`);
    return {...r,id:`${source}:${ref.ref}`,image:ref.imagePrintLine?`https://images.pfconcept.com/ImprintImages_All/JPG/500x500/${encodeURIComponent(ref.imagePrintLine)}`:null,svg:ref.svgFile?`https://imagedata.pfconcept.com/2d/models/${ref.svgFile}`:null};
   });
   prints.set(String(item.itemCode),[...(prints.get(String(item.itemCode))||[]),...options]);
  }
 }
}
function classifyProduct({supplierGroup='',category='',description='',material=''}){
 const text=clean(`${supplierGroup} ${category} ${description} ${material}`),cottonBag=/bomuld|cotton/.test(text)&&/mulepose|bomuldstaske|tote bag/.test(text);
 if(cottonBag)return {group:'Tasker og rejse',shopCategory:'bomuldstasker'};
 if(/caps?\b|kasket|hovedbeklædning|headwear|beanie|hue\b/.test(text))return {group:'Tøj og tekstiler',shopCategory:'caps'};
 if(/t-shirt|polo|skjorte|sweat|hoodie|hættetrøje|jakke|vest|tekstil|beklædning|apparel|trøje|fleece/.test(text))return {group:'Tøj og tekstiler',shopCategory:'toj'};
 if(/mulepose|taske|rygsæk|pung|kuffert|trolley|bag\b|backpack|rejsetilbehør|toilettaske/.test(text))return {group:'Tasker og rejse',shopCategory:'tasker'};
 if(/flaske|krus|kop\b|drikke|bottle|tumbler|mug\b|termokande|madkasse|lunchbox/.test(text))return {group:'Flasker og krus',shopCategory:'flasker'};
 if(/powerbank|oplader|elektronik|technology|højttaler|speaker|øretelefon|headphone|usb\b|kabel|adapter|telefon|tablet|computer/.test(text))return {group:'Elektronik',shopCategory:'elektronik'};
 if(/paraply|umbrella/.test(text))return {group:'Paraplyer',shopCategory:'paraplyer'};
 if(/sport|fitness|golf|udendørs|outdoor|cykel|løb|håndklæde|tæppe/.test(text))return {group:'Sport og fritid',shopCategory:'sport'};
 if(/hjem|køkken|home|kitchen|lys\b|candle|glas\b|bestik|skål|værktøj|tool/.test(text))return {group:'Hjem og køkken',shopCategory:'hjem'};
 return {group:'Kontor og gaver',shopCategory:'kontor'};
}
function resolvedBrand(name,group){
 const label=String(name||'Andre mærker').trim()||'Andre mærker',key=clean(label),known=knownBrands.get(key);if(known)return known;
 const base=slug(label),existing=[...knownBrands.values()].find(brand=>brand.id===base&&clean(brand.name)!==key),id=existing?`${base}-${knownBrands.size}`:base,brand={id,name:label,group,focus:group,description:'Se produkter, varianter og tilgængelige muligheder for logo og tekst.',logo:null,status:'available',connected:true};knownBrands.set(key,brand);return brand;
}
const products=[];
for(const source of sources){
 const feed=(await read(source)).pfcProductfeed.productfeed; timestamps.push({source,date:feed.creationDateTime});
 for(const {model:m} of feed.models){
  const items=m.items.map(x=>x.item),curated=curatedProducts.get(String(m.modelCode));
  const supplierGroup=items[0].categoryData?.groupDesc||'',category=items[0].categoryData?.catDesc||'',material=items[0].material||'';
  const classification=classifyProduct({supplierGroup,category,description:m.description,material}),brand=resolvedBrand(items[0]?.brand,classification.group);
  const variants=items.map(i=>{
   const c=list(i.colors?.color)[0]||{}, images=[...new Set(Object.entries(i.imageData||{}).filter(([k,v])=>v&&!k.includes('Logo')).map(([,v])=>`https://images.pfconcept.com/ProductImages_All/JPG/500x500/${encodeURIComponent(v)}`))];
   return {sku:String(i.itemCode),size:i.size||'',color:c.colorDesc||'',colorCode:c.colorCode,hex:/^[a-f\d]{6}$/i.test(c.hexColor)?`#${c.hexColor}`:'#cccccc',images,discontinued:String(i.isDiscontinued)==='true',decorationMandatory:String(i.decorationSettings?.decoDefault?.decorationMandatory).toLowerCase()==='no'?false:true,options:prints.get(String(i.itemCode))||[]};
  }).filter(variant=>!variant.discontinued);
  if(!variants.length)continue;
  products.push({id:`pf-${m.modelCode}`,modelCode:String(m.modelCode),brandId:curated?.brandId||brand.id,brand:curated?.brand||brand.name,name:m.description,description:m.extDesc||'',category,shopCategory:curated?.shopCategory||classification.shopCategory,group:curated?.group||classification.group,material,variants});
 }
}
if(!products.length||new Set(products.map(p=>p.id)).size!==products.length)throw Error('Empty or duplicate catalog');
const counts=Object.fromEntries([...new Set(products.map(product=>product.brandId))].map(id=>[id,products.filter(product=>product.brandId===id).length])),availableBrands=[...knownBrands.values()].filter(brand=>counts[brand.id]).sort((a,b)=>(wanted.has(clean(b.name))-wanted.has(clean(a.name)))||a.name.localeCompare(b.name,'da'));
const result={source:'product-data',importedAt:new Date().toISOString(),feeds:timestamps,brands:availableBrands,products,counts};
const summary={...result,products:products.map(product=>({...product,insulation:insulationStatus(product),material:undefined,description:undefined,variants:product.variants.map(variant=>({...variant,images:variant.images.slice(0,1),options:undefined,methods:[...new Set(variant.options.map(option=>option.impMethod).filter(Boolean))],optionCount:variant.options.length})),detail:false}))},temporary='data/pf-products.tmp';
await rm(temporary,{recursive:true,force:true});await mkdir(temporary,{recursive:true});
const shards=new Map();for(const product of products){const key=pfCatalogShard(product.id);shards.set(key,[...(shards.get(key)||[]),product]);}
for(let number=0;number<64;number++){const key=String(number).padStart(2,'0');await writeFile(`${temporary}/${key}.json.gz`,await zip(JSON.stringify(shards.get(key)||[]),{level:9}));}
await writeFile('data/pf-catalog-index.json.tmp',JSON.stringify(summary));await rm('data/pf-products',{recursive:true,force:true});await rename(temporary,'data/pf-products');await rename('data/pf-catalog-index.json.tmp','data/pf-catalog-index.json');await rm('data/pf-catalog.json',{force:true});
console.log(JSON.stringify({models:products.length,variants:products.reduce((s,p)=>s+p.variants.length,0),withoutPrint:products.flatMap(p=>p.variants).filter(v=>!v.options.length).length,brands:result.counts},null,2));
