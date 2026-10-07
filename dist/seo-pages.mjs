import {homeHero} from './home-hero.mjs';
// Shared by the HTTP response and client-side navigation. Keep metadata tied to the visible page.
import {categoryEditorial,productEditorial} from './seo-copy.mjs';
import {canonicalSubcategory} from './product-groups.mjs?v=23';
const origin='https://smerch.dk';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const absolute=value=>{try{return new URL(value,origin).href;}catch{return origin+'/assets/smerch-orange-tote-lifestyle.jpg';}};
const groups={toj:'Tekstil',tasker:'Tasker',flasker:'Drikkeartikler',kontor:'Kuglepenne og skriveartikler',elektronik:'Teknologi',papir:'Notesbøger og papir',paraplyer:'Paraplyer',hjem:'Hjem og livsstil',giveaways:'Messe',sport:'Sport og fritid',spil:'Spil og legetøj',vaerktoj:'Værktøj og biltilbehør',sundhed:'Sundhed og personlig pleje'};
const mainImage=product=>product?.variants?.find(variant=>!variant.discontinued&&variant.images?.[0])?.images?.[0]||null;
const productURL=product=>`/design/${product.id}`;
const asUrl=(path,params)=>origin+path+(params?.toString()?`?${params}`:'');
const cleanText=value=>String(value||'').replace(/\s+/g,' ').trim();
const excerpt=(value,max=155)=>{const text=cleanText(value);return text.length>max?text.slice(0,max-1).replace(/\s+\S*$/,'')+'…':text;};
export function verifiedProductOffer(product,priceData,stockData,checkout){
 if(!product||!priceData?.available||!stockData?.available||!checkout?.ready||checkout.mode!=='live')return null;
 const price=priceData.products?.[product.id],quantity=price?.fromQuantity;
 if(!Number.isInteger(price?.fromIncVat)||price.fromIncVat<=0||!Number.isInteger(quantity)||quantity<1)return null;
 const pricedVariants=product.variants.filter(variant=>!variant.discontinued&&priceData.skus?.[variant.sku]);
 if(!pricedVariants.length||pricedVariants.some(variant=>!Number.isInteger(stockData.items?.[variant.sku]?.available)||stockData.items[variant.sku].available<quantity))return null;
 return {'@type':'Offer',url:origin+productURL(product),priceCurrency:'DKK',price:(price.fromIncVat/100).toFixed(2),availability:'https://schema.org/InStock',itemCondition:'https://schema.org/NewCondition',eligibleQuantity:{'@type':'QuantitativeValue',minValue:quantity,unitCode:'C62'}};
}
export function seoPage(path,search='',catalog={products:[],brands:[]},detail=null,commerce=null){
 const params=new URLSearchParams(search),products=catalog?.products||[],brands=catalog?.brands||[];
 let title='Premium merchandise med logo | Smerch',description='Find merchandise til virksomheder: drikkeflasker, tasker, tekstil og mere. Vælg produkt, tilføj logo og godkend korrektur før produktion.',canonical=origin+'/',heading='Merchandise med logo',image=origin+'/assets/smerch-orange-tote-lifestyle.jpg',robots='index,follow,max-image-preview:large',kind='website',product=null;
 if(path==='/produkter'){
  const group=params.get('kategori'),subcategory=canonicalSubcategory(params.get('underkategori')),brandId=params.get('brand'),brand=brands.find(item=>item.id===brandId);
  const validGroup=groups[group],validSubcategory=validGroup&&products.some(item=>item.shopCategory===group&&item.category===subcategory),validBrand=brand&&products.some(item=>item.brandId===brandId);
  const curated=new URLSearchParams();if(validGroup)curated.set('kategori',group);if(validSubcategory)curated.set('underkategori',subcategory);else if(!validGroup&&validBrand)curated.set('brand',brandId);
  heading=validSubcategory?`${subcategory} med logo`:validGroup?`${validGroup} med logo`:validBrand?`${brand.name} merchandise`:'Produkter med logo';
  title=`${heading} | Smerch`;
  description=excerpt(categoryEditorial(group,subcategory)?.intro||((validBrand?`Se merchandise fra ${brand.name} hos Smerch. Find produkter til jeres brand, vælg variant og tilføj eget logo.`:'Udforsk merchandise med logo til virksomheder. Find tasker, tekstil, drikkeartikler og flere produkter, og design dem hos Smerch.')));
  canonical=asUrl('/produkter',curated);
  if([...params.keys()].some(key=>!curated.has(key))||params.has('demo')||params.get('kategori')&&!validGroup||params.get('underkategori')&&!validSubcategory||params.get('underkategori')!==subcategory||params.get('brand')&&!validBrand)robots='noindex,follow';
 }else if(/^\/design\/pf-[a-z0-9]+$/i.test(path)){
  product=products.find(item=>item.id===path.split('/').at(-1));
  if(!product)return null;
  const descriptionText=productEditorial(product.id)?.intro||detail?.description||`${product.name} fra ${product.brand}. Se farver og muligheder for eget logo, og godkend korrektur før produktion.`;
  heading=product.name;title=`${product.name} med logo | Smerch`;description=excerpt(descriptionText);canonical=origin+productURL(product);image=mainImage(product)||image;kind='product';
 }else if(path==='/brands'){
  heading='Brands hos Smerch';title='Brands til merchandise | Smerch';description='Udforsk udvalgte brands til merchandise med logo. Find produkter fra blandt andre Stanley, Thule og Moleskine hos Smerch.';canonical=origin+path;
 }else if(path==='/specialproduktion'){
  heading='Specialproduktion af merchandise';title='Specialproduktion af merchandise | Smerch';description='Få udviklet merchandise med jeres eget udtryk. Fortæl Smerch om idé, materialer og antal, så hjælper vi med en løsning.';canonical=origin+path;
 }else if(path==='/om-smerch'){
  heading='Om Smerch';title='Om Smerch | Merchandise til virksomheder';description='Mød Smerch og se, hvordan vi hjælper virksomheder med at vælge og designe merchandise med eget logo.';canonical=origin+path;
 }else if(path==='/kontakt'){
  heading='Kontakt Smerch';title='Kontakt Smerch | Spørg om merchandise';description='Kontakt Smerch om merchandise, tryk, levering og specialproduktion. Vi hjælper dig videre med dit projekt.';canonical=origin+path;
 }else if(path!=='/'){
  heading=({'/kurv':'Din kurv','/betaling':'Levering og betaling','/ordre':'Din ordre','/demokurv':'Demo-tilbudskurv','/gennemgang':'Gennemgang'}[path])||'Siden findes ikke';title=`${heading} | Smerch`;description='';canonical=origin+path;robots='noindex,nofollow';
 }
 if(search&&path!=='/produkter'&&path!=='/')robots='noindex,follow';
 const schema=[{ '@context':'https://schema.org','@type':'Organization',name:'Smerch',url:origin+'/',logo:origin+'/assets/smerch.svg',email:'hello@smerch.dk',telephone:'+45 27 82 22 77',address:{'@type':'PostalAddress',streetAddress:'Raffinaderivej 10e',postalCode:'2300',addressLocality:'København S',addressCountry:'DK'} }];
 if(path==='/')schema.push({'@context':'https://schema.org','@type':'WebSite',name:'Smerch',url:origin+'/',inLanguage:'da-DK'});
 if(product){const productSchema={'@context':'https://schema.org','@type':'Product',name:product.name,description:cleanText(detail?.description||description),image:[absolute(image)],sku:product.modelCode||product.id,brand:{'@type':'Brand',name:product.brand}};const offer=verifiedProductOffer(product,commerce?.prices,commerce?.stock,commerce?.checkout);if(offer)productSchema.offers=offer;schema.push(productSchema);}
 if(path==='/produkter'||product)schema.push({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{ '@type':'ListItem',position:1,name:'Forside',item:origin+'/'},{'@type':'ListItem',position:2,name:product?'Produkter':heading,item:product?origin+'/produkter':canonical},...(product?[{'@type':'ListItem',position:3,name:product.name,item:canonical}]:[])]});
 return {title,description,canonical,heading,image:absolute(image),robots,kind,product,schema};
}
export function seoHead(page){return `<meta name="description" content="${escapeHTML(page.description)}"><meta name="robots" content="${escapeHTML(page.robots)}"><link rel="canonical" href="${escapeHTML(page.canonical)}"><meta property="og:type" content="${page.kind==='product'?'product':'website'}"><meta property="og:site_name" content="Smerch"><meta property="og:locale" content="da_DK"><meta property="og:title" content="${escapeHTML(page.title)}"><meta property="og:description" content="${escapeHTML(page.description)}"><meta property="og:url" content="${escapeHTML(page.canonical)}"><meta property="og:image" content="${escapeHTML(page.image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(page.title)}"><meta name="twitter:description" content="${escapeHTML(page.description)}"><meta name="twitter:image" content="${escapeHTML(page.image)}"><script type="application/ld+json" id="seo-jsonld">${JSON.stringify(page.schema).replace(/</g,'\\u003c')}</script>`;}
export function seoMain(page,catalog){
 const products=catalog?.products||[];
 if(page.product){const product=page.product,variant=product.variants.find(item=>!item.discontinued&&item.images?.[0]),photo=variant?.images?.[0],editorial=productEditorial(product.id);return `<section class="wrap section seo-initial"><nav aria-label="Brødkrumme"><a href="/">Forside</a> / <a href="/produkter">Produkter</a></nav><h1>${escapeHTML(product.name)}</h1>${photo?`<img src="${escapeHTML(photo)}" alt="${escapeHTML(product.name)} i farven ${escapeHTML(variant.color||'vist variant')}" width="500" height="500" fetchpriority="high">`:''}<p>${escapeHTML(editorial?.intro||page.description)}</p>${editorial?`<p>${escapeHTML(editorial.guide)}</p>`:''}<p>Brand: ${escapeHTML(product.brand)}</p><a href="/produkter">Se flere produkter</a></section>`;}
 if(page.canonical.includes('/produkter')){const url=new URL(page.canonical),group=url.searchParams.get('kategori'),subcategory=url.searchParams.get('underkategori'),brand=url.searchParams.get('brand');const matching=products.filter(item=>(!group||item.shopCategory===group)&&(!subcategory||item.category===subcategory)&&(!brand||item.brandId===brand)),visibleHeading=subcategory||groups[group]||page.heading;return `<section class="wrap section seo-initial"><h1>${escapeHTML(visibleHeading)}</h1><nav aria-label="Produktgrupper">${Object.entries(groups).map(([id,name])=>`<a href="/produkter?kategori=${id}">${escapeHTML(name)}</a>`).join('')}</nav><div class="product-grid">${matching.slice(0,24).map(item=>`<article><a href="${productURL(item)}">${mainImage(item)?`<img src="${escapeHTML(mainImage(item))}" alt="${escapeHTML(item.name)} fra ${escapeHTML(item.brand)}" loading="lazy" width="500" height="500">`:''}<h2>${escapeHTML(item.name)}</h2></a></article>`).join('')}</div></section>`;}
 if(page.canonical===origin+'/')return homeHero;
 return `<section class="wrap section seo-initial"><h1>${escapeHTML(page.heading)}</h1><p>${escapeHTML(page.description)}</p><a href="/produkter">Se produkter</a></section>`;
}
export function sitemapXML(catalog){const products=catalog?.products||[],entries=['/','/produkter','/brands','/specialproduktion','/om-smerch','/kontakt','/handelsbetingelser','/privatlivspolitik'];for(const id of Object.keys(groups))if(products.some(item=>item.shopCategory===id)){entries.push(`/produkter?kategori=${id}`);for(const category of new Set(products.filter(item=>item.shopCategory===id).map(item=>item.category).filter(Boolean)))entries.push(`/produkter?kategori=${id}&underkategori=${encodeURIComponent(category)}`);}for(const brand of catalog?.brands||[])if(products.some(item=>item.brandId===brand.id))entries.push(`/produkter?brand=${encodeURIComponent(brand.id)}`);for(const product of products)entries.push(productURL(product));return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+entries.map(path=>{const product=path.startsWith('/design/')?products.find(item=>item.id===path.split('/').at(-1)):null,img=product&&mainImage(product);return `<url><loc>${escapeHTML(origin+path)}</loc>${img?`<image:image><image:loc>${escapeHTML(absolute(img))}</image:loc></image:image>`:''}</url>`;}).join('')+'</urlset>';}
export const robotsTXT=`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /vendor/\nSitemap: ${origin}/sitemap.xml\n`;
