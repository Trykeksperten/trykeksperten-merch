// Public supplier copy only. Never translates or transmits customer artwork.
import {readFile,writeFile} from 'node:fs/promises';
import {loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
const dict={},models=new Map(),list=x=>Array.isArray(x)?x:x?[x]:[];
const add=(da,en)=>{if(typeof da==='string'&&typeof en==='string'&&da.trim()&&en.trim())dict[da.trim().replace(/\s+/g,' ')]=en.trim().replace(/\s+/g,' ');};
for(const [feed,local] of [['productfeed_en_v3','main'],['productfeedws_en_v3','ws']]){
 const data=process.argv[2]?JSON.parse(await readFile(process.argv[2]+'/pf-en-'+local+'.json','utf8')):await (await fetch('https://www.pfconcept.com/portal/datafeed/'+feed+'.json',{signal:AbortSignal.timeout(60000)})).json();
 for(const {model} of data.pfcProductfeed.productfeed.models)models.set(String(model.modelCode),model);
}
const overrides=JSON.parse(await readFile('data/translations/pf-en-overrides.json','utf8'));
for(const [id,value] of Object.entries(overrides))if(!models.has(id))models.set(id,value);
const catalog=await loadCatalogIndex(),missing=[];
for(const item of catalog.products){
 const p=await loadPFProduct(item.id),en=models.get(p.modelCode);
 if(!en){missing.push(p.id);continue;}
 add(p.name,en.description);add(p.description,en.extDesc);
 const items=list(en.items).map(x=>x.item),first=items[0];
 if(first){add(p.category,first.categoryData?.catDesc);add(p.group,first.categoryData?.groupDesc);add(p.material,first.material);}
 for(const v of p.variants){const ev=items.find(x=>String(x.itemCode)===v.sku);if(ev)add(v.color,list(ev.colors?.color)[0]?.colorDesc);}
}
if(missing.length)throw Error('Missing English products: '+missing.join(', '));
await writeFile('dist/pf-english.json',JSON.stringify(dict));
console.log('English copy prepared for '+catalog.products.length+' products; '+Object.keys(dict).length+' translated phrases.');
