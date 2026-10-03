import {isHiddenShopBrand} from '../dist/shop-brand-policy.mjs';
import {shippingOrigin,shippingCountryLabel,isPolandProduct} from './pf-shipping-origin.mjs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
const defaults=JSON.parse(await readFile(new URL('../config/assortment.json',import.meta.url),'utf8'));
const defaultIds=new Set(defaults.visibleIds);
const location=()=>dataPath('assortment.json');
export async function readAssortment(path=location()){
 try{const state=JSON.parse(await readFile(path,'utf8'));if(!state.overrides||typeof state.overrides!=='object')throw Error('Ugyldigt sortiment.');return state.version===defaults.version?state:{version:defaults.version,overrides:{}};}catch(error){if(error.code==='ENOENT')return {version:defaults.version,overrides:{}};throw error;}
}
export function isListed(id,state){return Object.hasOwn(state.overrides,id)?state.overrides[id]===true:defaultIds.has(id);}
export function isVisibleProduct(product,state){return isPolandProduct(product)&&(Object.hasOwn(state.overrides,product.id)?state.overrides[product.id]===true:!isHiddenShopBrand(product)&&isListed(product.id,state));}
export function publicAssortment(catalog,state){const products=catalog.products.filter(p=>isVisibleProduct(p,state)),brands=new Set(products.map(p=>p.brandId));return {...catalog,products,brands:catalog.brands.filter(b=>brands.has(b.id)),counts:{products:products.length,variants:products.reduce((n,p)=>n+p.variants.length,0)}};}
let pending=Promise.resolve();
export function setVisibility(id,visible,catalog,{path=location()}={}){
 const job=pending.then(async()=>{if(typeof visible!=='boolean'||!catalog.products.some(p=>p.id===id))throw Error('Ugyldigt produkt eller synlighed.');if(visible&&!isPolandProduct(catalog.products.find(p=>p.id===id)))throw Error('Kun produkter med bekræftet produktionssted i Polen kan vises i webshoppen.');const state=await readAssortment(path);state.overrides[id]=visible;state.updatedAt=new Date().toISOString();await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,path);return state;});pending=job.catch(()=>{});return job;
}
export function adminProduct(product,state){return {id:product.id,name:product.name,brand:product.brand,category:product.category,group:product.group,visible:isVisibleProduct(product,state),shippingOrigin:shippingOrigin(product),shippingCountry:shippingCountryLabel(product),eligibleForShop:isPolandProduct(product),image:product.variants.find(v=>v.images?.length)?.images[0]||'',variantCount:product.variants.length,activeVariants:product.variants.filter(v=>!v.discontinued).length,colors:[...new Set(product.variants.map(v=>v.color).filter(Boolean))],methods:[...new Set(product.variants.flatMap(v=>v.methods||[]))]};}
