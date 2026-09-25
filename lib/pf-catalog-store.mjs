import {readFile,stat} from 'node:fs/promises';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';

const unzip=promisify(gunzip),shardCount=64,cache=new Map();
let indexPromise,indexMtime;

export function pfCatalogShard(id){let hash=2166136261;for(const char of String(id)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return String((hash>>>0)%shardCount).padStart(2,'0');}

export async function loadCatalogIndex(){const path=new URL('../data/pf-catalog-index.json',import.meta.url),mtime=(await stat(path)).mtimeMs;if(!indexPromise||mtime!==indexMtime){indexMtime=mtime;indexPromise=readFile(path,'utf8').then(JSON.parse).catch(error=>{indexPromise=null;throw error;});}return indexPromise;}

async function loadShard(id){const key=pfCatalogShard(id);if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}const compressed=await readFile(new URL(`../data/pf-products/${key}.json.gz`,import.meta.url)),products=JSON.parse((await unzip(compressed)).toString());cache.set(key,products);while(cache.size>6)cache.delete(cache.keys().next().value);return products;}

export async function loadPFProduct(id){const products=await loadShard(id),product=products.find(product=>product.id===id);if(!product)throw Error('Produktet findes ikke længere.');return product;}

export async function loadProductCatalog(ids=[]){const products=[];for(const id of [...new Set(ids)])products.push(await loadPFProduct(id));const index=await loadCatalogIndex();return {...index,products};}

export async function* iteratePFProducts(){for(let number=0;number<shardCount;number++){const key=String(number).padStart(2,'0'),compressed=await readFile(new URL(`../data/pf-products/${key}.json.gz`,import.meta.url)),products=JSON.parse((await unzip(compressed)).toString());for(const product of products)yield product;}}
