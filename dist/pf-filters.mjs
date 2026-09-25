import {pricedVariants} from './pf-visibility.mjs';

export function insulationStatus(product){
 const text=`${product.name||''} ${product.description||''}`.toLowerCase();
 if(/ikke[ -]?isoleret|uisoleret|enkeltvæg|single[ -]?wall/.test(text))return 'no';
 if(/isoler|insulat|vakuum|vacuum|dobbeltvæg|double[ -]?wall|termo|thermo/.test(text))return 'yes';
 return 'unknown';
}

export function colorFamily(variant){
 const value=`${variant.color||''} ${variant.colorCode||''}`.toLowerCase();
 const names=[['Sort',/sort|black/],['Hvid',/hvid|white/],['Blå',/blå|blue|navy|cyan/],['Grøn',/grøn|green|olive|mint/],['Rød',/rød|red|burgundy|bordeaux/],['Gul',/gul|yellow/],['Orange',/orange/],['Lilla',/lilla|purple|violet/],['Pink',/pink|rosa/],['Brun',/brun|brown|chocolate/],['Grå',/grå|grey|gray|anthracite/],['Beige',/beige|natur|natural|sand|khaki|creme|cream/],['Sølv',/sølv|silver/],['Guld',/guld|gold/],['Transparent',/transpar|clear/]];
 return names.find(([,pattern])=>pattern.test(value))?.[0]||'Andre farver';
}

export function visibleVariants(product,priceData){
 return priceData?.products?.[product.id]?pricedVariants(product,priceData):product.variants.filter(variant=>!variant.discontinued);
}

export function productMethods(product,priceData){
 return [...new Set(visibleVariants(product,priceData).flatMap(variant=>variant.methods||[]))];
}

export function productColors(product,priceData){
 return [...new Set(visibleVariants(product,priceData).map(colorFamily))];
}

export function priceBand(price){
 if(!Number.isFinite(price))return '';
 if(price<5000)return 'under-50';
 if(price<10000)return '50-100';
 if(price<25000)return '100-250';
 if(price<50000)return '250-500';
 return 'over-500';
}

export function sortPFProducts(products,mode,priceData,tierFor=()=> 'recommended'){
 const list=[...products];
 const byName=(a,b)=>a.name.localeCompare(b.name,'da');
 const priceFor=product=>{
  const value=Number(priceData?.products?.[product.id]?.fromIncVat);
  return Number.isFinite(value)?value:null;
 };
 if(mode==='price-asc'||mode==='price-desc')return list.sort((a,b)=>{
  const aPrice=priceFor(a),bPrice=priceFor(b);
  if(aPrice===null&&bPrice===null)return byName(a,b);
  if(aPrice===null)return 1;
  if(bPrice===null)return -1;
  return (mode==='price-asc'?aPrice-bPrice:bPrice-aPrice)||byName(a,b);
 });
 if(mode==='name-desc')return list.sort((a,b)=>-byName(a,b));
 if(mode==='name-asc')return list.sort(byName);
 if(mode==='brand')return list.sort((a,b)=>a.brand.localeCompare(b.brand,'da')||byName(a,b));
 const tierRank={premium:0,recommended:1,value:2};
 return list.sort((a,b)=>(tierRank[tierFor(a)]??99)-(tierRank[tierFor(b)]??99)||byName(a,b));
}

export function filterPFProducts(products,params,priceData,qualityTier,favorites=[]){
 const q=(params.get('q')||'').toLocaleLowerCase('da'),category=params.get('kategori')||'',subcategory=params.get('underkategori')||'',brand=params.get('brand')||'',level=params.get('niveau')||'',color=params.get('farve')||'',insulation=params.get('isolering')||'',method=params.get('tryk')||'',price=params.get('pris')||'',chosen=new Set(favorites);
 return products.filter(product=>{
  if(category&&product.shopCategory!==category)return false;
  if(subcategory&&product.category!==subcategory)return false;
  if(brand&&product.brandId!==brand)return false;
  if(level&&qualityTier(product)!==level)return false;
  if(params.has('udvalgte')&&!chosen.has(product.id))return false;
  if(q&&!`${product.name} ${product.brand} ${product.modelCode}`.toLocaleLowerCase('da').includes(q))return false;
  if(color&&!productColors(product,priceData).includes(color))return false;
  if(insulation&&product.insulation!==insulation)return false;
  if(method&&!productMethods(product,priceData).includes(method))return false;
  if(price&&priceBand(priceData?.products?.[product.id]?.fromIncVat)!==price)return false;
  return true;
 });
}
