import {readFile} from 'node:fs/promises';
import {dataPath} from './data-path.mjs';
import {validateDesignLine} from './design-validation.mjs';
const array=x=>Array.isArray(x)?x:x?[x]:[];
const children=(x,key)=>array(x).flatMap(y=>array(y?.[key]));
function nodes(x,predicate,out=[]){if(x&&typeof x==='object'){if(predicate(x))out.push(x);for(const v of Object.values(x))nodes(v,predicate,out);}return out;}
const number=x=>x===null||x===undefined||x===''?NaN:Number(String(x).replace(',','.'));
const money=x=>Math.round((x+Number.EPSILON)*100);
const customerSetup=(net,rules={})=>{
 const markup=Number.isFinite(rules.setupMarkup)?rules.setupMarkup:0;
 return Math.ceil(money(net*(1+markup/100))/5000)*5000;
};
const headwearCategories=new Set(['Caps & hatte','Huer']);
const penFloorBreaks=[
 {min:1,unitExVat:480},
 {min:250,unitExVat:400},
 {min:500,unitExVat:320},
 {min:1000,unitExVat:288},
 {min:2500,unitExVat:256},
 {min:5000,unitExVat:232},
 {min:10000,unitExVat:220}
];
const isBallpointPen=product=>product?.category==='Kuglepenne';
const penFloor=quantity=>[...penFloorBreaks].reverse().find(row=>quantity>=row.min)?.unitExVat||penFloorBreaks[0].unitExVat;
function customerGoodsUnit(net,product,rules,quantity=1){
 const headwear=headwearCategories.has(product.category),markup=headwear&&Number.isFinite(rules.headwearGoodsMarkup)?rules.headwearGoodsMarkup:rules.goodsMarkup;
 let adjusted=money(net*(1+markup/100));
 if(headwear&&!Number.isFinite(rules.headwearGoodsMarkup))adjusted=Math.round(adjusted*1.25);
 return isBallpointPen(product)?Math.max(adjusted,penFloor(quantity)):adjusted;
}
function date(value){const s=String(value||'');if(/^\d{2}\/\d{2}\/\d{4}/.test(s)){const [d,m,y]=s.slice(0,10).split('/');return `${y}-${m}-${d}T12:00:00Z`;}return s;}
export function normalizePrices(productFeed,printFeed){
 const goodsFeeds=nodes(productFeed,x=>x.creationDateTime&&x.models),decoFeeds=nodes(printFeed,x=>x.createdDateTime&&x.decoCharge);
 if(goodsFeeds.length!==1||decoFeeds.length!==1)throw Error('Ukendt PF-prisfeedstruktur. Bevar tidligere priser og kontrollér filerne.');
 const goods=goodsFeeds[0],deco=decoFeeds[0],items=nodes(goods,x=>(x.itemcode||x.itemCode)&&x.scales);
 if(!items.length)throw Error('Produktprisfeedet er tomt.');
 const products={};
 for(const item of items){const sku=String(item.itemcode||item.itemCode);if(products[sku])throw Error('Dubleret SKU i prisfeed.');const tiers=children(item.scales,'scale').map(s=>({min:number(s.priceBar),net:number(s.nettPrice)}));if(!tiers.length||tiers.some(t=>!Number.isInteger(t.min)||t.min<1||!Number.isFinite(t.net)||t.net<0))throw Error('Ugyldige pristrin i PF-feed.');
 products[sku]={currency:item.currency,minimumDecoration:number(item.minDecoQty),tiers,temporary:Boolean(item.promotion||item.customerSpecificPrice)};}
 const prints={};for(const row of array(deco.decoCharge)){if(!row.printCode)throw Error('Trykkode mangler.');if(prints[row.printCode])throw Error('Dubleret trykkode.');const combinations=[];
 for(const size of children(row.logoSizes,'logoSize'))for(const color of children(size.amountColors,'amountColor'))for(const setup of children(color.amountSetupCharges,'amountSetupCharge')){
 const rawColors=color.amountColorsId??color.AmountColorsId,colors=/^full\s*colou?r$/i.test(String(rawColors).trim())?1:number(rawColors);
 combinations.push({area:number(size.logoSizeCm2),colors,setups:number(setup.amountSetupChargeId??setup.AmountSetupChargeId),setup:number(setup.setupCharge??setup.SetupCharge),tiers:children(setup.decoPrices,'decoPrice').map(p=>({min:number(p.decoPriceFromQty),net:number(p.price)}))});}
 if(!combinations.length||combinations.some(c=>![c.area,c.colors,c.setups,c.setup].every(n=>Number.isFinite(n)&&n>=0)||!c.tiers.length||c.tiers.some(t=>!Number.isFinite(t.net)||t.net<0||!Number.isInteger(t.min)||t.min<1)))throw Error('Ugyldige trykpriser.');
 prints[row.printCode]={dependence:row.priceDependence,currency:deco.currency,ltm:number(row.LTMCharge),combinations};}
 if(!Object.keys(prints).length)throw Error('Trykprisfeedet er tomt.');
 return {productDate:date(goods.creationDateTime),printDate:date(deco.createdDateTime),products,prints};
}
export function normalizeStock(stockFeed){
 const feeds=nodes(stockFeed,x=>x.creationDateTime&&x.models);if(feeds.length!==1)throw Error('Ukendt PF-lagerfeedstruktur.');
 const feed=feeds[0],rows=nodes(feed,x=>(x.itemcode||x.itemCode)&&Object.hasOwn(x,'stockDirect'));if(!rows.length)throw Error('Lagerfeedet er tomt.');
 const items={};for(const row of rows){const sku=String(row.itemcode||row.itemCode),available=number(row.stockDirect),incoming=number(row.stockNextPo),future=number(row.StockFuture??row.stockFuture);if(items[sku])throw Error('Dubleret SKU i lagerfeed.');if(!Number.isFinite(available))throw Error('Ugyldig lagerbeholdning.');items[sku]={available:Math.max(0,Math.floor(available)),incoming:Number.isFinite(incoming)&&incoming>=0?Math.floor(incoming):null,incomingDate:row.stockDateNextPo||null,future:Number.isFinite(future)&&future>=0?Math.floor(future):null};}
 return {updatedAt:date(feed.creationDateTime),items};
}
export function listPFStock(catalog,stock,now=Date.now()){
 const unavailable=message=>({available:false,message,updatedAt:null,items:{}}),timestamp=Date.parse(stock?.updatedAt);
 if(!stock)return unavailable('Lagerfeedet er ikke tilsluttet endnu.');if(!Number.isFinite(timestamp)||now-timestamp>=3*86400000||timestamp>now+86400000)return unavailable('Lagerstatus skal opdateres.');
 const allowed=new Set(catalog.products.flatMap(p=>p.variants.map(v=>v.sku))),items={};for(const [sku,row]of Object.entries(stock.items||{}))if(allowed.has(sku))items[sku]={available:row.available,incoming:row.incoming,incomingDate:row.incomingDate};return {available:true,message:'',updatedAt:stock.updatedAt,items};
}
export function validateCartLine(catalog,line){
 return validateDesignLine(catalog,line);
}
const tier=(tiers,quantity)=>[...tiers].sort((a,b)=>b.min-a.min).find(t=>quantity>=t.min);
export function listPFProductTiers(catalog,productId,sku,prices,rules,now=Date.now()){
 const unavailable=message=>({available:false,message,tiers:[]}),product=catalog.products.find(row=>row.id===productId),variant=product?.variants.find(row=>row.sku===sku),source=prices?.products?.[sku];
 if(!product||!variant||variant.discontinued)return unavailable('Produktvarianten findes ikke længere.');
 if(!source||source.currency!=='DKK')return unavailable('Der mangler en aktuel pris for denne variant.');
 if(!rules||!Number.isFinite(rules.goodsMarkup)||rules.goodsMarkup<0)return unavailable('Salgsprisen er endnu ikke fastlagt.');
 const updated=Date.parse(prices.productDate);if(!Number.isFinite(updated)||now-updated>=8*86400000||updated>now+86400000)return unavailable('Produktpriserne skal opdateres.');
 const minimum=Number.isInteger(source.minimumDecoration)&&source.minimumDecoration>0?source.minimumDecoration:Math.min(...source.tiers.map(row=>row.min));
 const penThresholds=isBallpointPen(product)?penFloorBreaks.map(row=>row.min).filter(min=>min>minimum):[];
 const thresholds=[...new Set([minimum,...source.tiers.map(row=>row.min).filter(min=>min>minimum),...penThresholds])].sort((a,b)=>a-b),tiers=[];
 for(const min of thresholds){const step=tier(source.tiers,min);if(!step||!Number.isFinite(step.net)||step.net<0)return unavailable('Pristrinene er ufuldstændige.');const unitExVat=customerGoodsUnit(step.net,product,rules,min),unitIncVat=unitExVat+Math.round(unitExVat*.25);if(!tiers.length||unitExVat!==tiers.at(-1).unitExVat)tiers.push({min,unitExVat,unitIncVat});}
 return {available:true,message:'',currency:'DKK',minimumQuantity:minimum,tiers};
}
export function quotePFLine(catalog,line,prices,rules,now=Date.now()){
 const error=validateCartLine(catalog,line);if(error)return {error,totalIncVat:null};
 const unknown=message=>({totalIncVat:null,quantity:line.quantity,message});
 if(!prices)return unknown('Priserne er ikke tilsluttet endnu. Dit produktvalg kan stadig gemmes i kurven.');
 if(!rules||![rules.goodsMarkup,rules.printMarkup].every(n=>Number.isFinite(n)&&n>=0))return unknown('Salgsprisen er endnu ikke fastlagt.');
 const fresh=s=>Number.isFinite(Date.parse(s))&&now-Date.parse(s)<8*86400000&&Date.parse(s)<=now+86400000;
 if(!fresh(prices.productDate)||(line.decorations.length&&!fresh(prices.printDate)))return unknown('Prisen skal opdateres, før vi kan vise en samlet pris.');
 const product=prices.products[line.sku];if(!product||product.currency!=='DKK')return unknown('Der mangler en DKK-pris for denne variant.');
 const unit=tier(product.tiers,line.quantity);if(!unit)return unknown('Der mangler et pristrin for dette antal.');
 const catalogProduct=catalog.products.find(p=>p.id===line.productId);
 const goodsUnit=customerGoodsUnit(unit.net,catalogProduct,rules,line.quantity);let print=0,setup=0;
 const variant=catalogProduct.variants.find(v=>v.sku===line.sku);
 for(const design of line.decorations){const option=variant.options.find(o=>o.id===design.optionId),charge=prices.prints[option.printCode];if(!charge||charge.currency!=='DKK')return unknown('Trykprisen mangler for den valgte placering.');
 const dependence=String(charge.dependence).toLowerCase();if(!['none','color','colour','colors','colours','size'].includes(dependence))return unknown('Denne trykpris kræver manuel afklaring.');
 const area=design.width*design.height/100;let choices=charge.combinations.filter(c=>dependence==='size'?c.area>=area:c.area===0);const chosenArea=Math.min(...choices.map(c=>c.area));choices=choices.filter(c=>c.area===chosenArea&&c.colors===(['color','colour','colors','colours'].includes(dependence)?design.colors:1));
 // PF's setupCharge is already the total for amountSetupChargeId (normally one per colour).
 // Select the matching row; multiplying it again would double-charge multicolour prints.
 choices=choices.filter(c=>c.setups===(['color','colour','colors','colours'].includes(dependence)?design.colors:1));if(choices.length!==1)return unknown('Trykprisen for dette design skal afklares.');
 const choice=choices[0],printTier=tier(choice.tiers,line.quantity);if(!printTier)return unknown('Trykprisen for dette antal mangler.');
 if(!Number.isFinite(product.minimumDecoration))return unknown('Minimumsantal for tryk skal afklares.');
 const ltm=line.quantity<product.minimumDecoration?charge.ltm:0;if(!Number.isFinite(ltm))return unknown('Tillæg for et mindre antal skal afklares.');
 print+=money(printTier.net*(1+rules.printMarkup/100))*line.quantity;setup+=customerSetup(choice.setup,rules)+money(ltm);
 }
 const goods=goodsUnit*line.quantity,net=goods+print+setup,vat=Math.round(net*.25);return {quantity:line.quantity,goods,print,setup,net,vat,totalIncVat:net+vat,currency:'DKK',freight:null};
}
export function quotePFCart(catalog,lines,prices,rules,now){const quotes=lines.map(l=>quotePFLine(catalog,l,prices,rules,now)),complete=quotes.every(q=>q.totalIncVat!==null),sum=field=>quotes.reduce((s,q)=>s+(q[field]||0),0);return {lines:quotes,totalIncVat:complete?sum('totalIncVat'):null,knownIncVat:sum('totalIncVat'),goods:sum('goods'),print:sum('print'),setup:sum('setup'),vat:sum('vat'),net:sum('net'),freight:null,currency:'DKK',message:complete?'':quotes.find(q=>q.error||q.message)?.error||quotes.find(q=>q.message)?.message||'En eller flere priser afventer.'};}
// Supplier-side amount for a Gateway purchase order. Never expose this through
// a public endpoint: the storefront quote above contains only selling prices.
export function supplierPFOrderAmounts(catalog,lines,prices,now=Date.now()){
 if(!prices||!Number.isFinite(Date.parse(prices.productDate))||now-Date.parse(prices.productDate)>=8*86400000)throw Error('PF-varepriser skal opdateres før ordreafsendelse.');
 if(lines.some(line=>line.decorations.length)&&(!Number.isFinite(Date.parse(prices.printDate))||now-Date.parse(prices.printDate)>=8*86400000))throw Error('PF-trykpriser skal opdateres før ordreafsendelse.');
 let total=0;const unitPrices=[];
 for(const line of lines){
  const product=prices.products?.[line.sku],variant=catalog.products.find(p=>p.id===line.productId)?.variants.find(v=>v.sku===line.sku);
  const unit=tier(product?.tiers||[],line.quantity);
  if(!variant||product?.currency!=='DKK'||!unit||!Number.isFinite(unit.net)||unit.net<=0)throw Error('PF-indkøbsprisen mangler for en variant.');
  unitPrices.push(unit.net);total+=unit.net*line.quantity;
  for(const design of line.decorations){
   const option=variant.options.find(o=>o.id===design.optionId),charge=prices.prints?.[option?.printCode];
   if(!charge||charge.currency!=='DKK')throw Error('PF-trykprisen mangler for en placering.');
   const dependence=String(charge.dependence).toLowerCase(),colourBased=['color','colour','colors','colours'].includes(dependence),area=design.width*design.height/100;
   let choices=charge.combinations.filter(c=>c.colors===(colourBased?design.colors:1)&&c.setups===(colourBased?design.colors:1));
   if(dependence==='size'){choices=choices.filter(c=>c.area>=area);const smallest=Math.min(...choices.map(c=>c.area));choices=choices.filter(c=>c.area===smallest);}else{choices=choices.filter(c=>c.area===0);}
   if(choices.length!==1)throw Error('PF-trykprisen er tvetydig for en placering.');
   const step=tier(choices[0].tiers,line.quantity),ltm=line.quantity<product.minimumDecoration?charge.ltm:0;
   if(!step||!Number.isFinite(step.net)||!Number.isFinite(choices[0].setup)||!Number.isFinite(ltm))throw Error('PF-prisoplysningerne er ufuldstændige.');
   total+=step.net*line.quantity+choices[0].setup+ltm;
  }
 }
 return {unitPrices,total:Math.round(total*100)/100,currency:'DKK'};
}
export function listPFProductPrices(catalog,prices,rules,now=Date.now()){
 const unavailable=message=>({available:false,message,products:{},skus:{}});
 if(!prices)return unavailable('Prisfeedet er ikke tilsluttet endnu.');
 if(!rules||!Number.isFinite(rules.goodsMarkup)||rules.goodsMarkup<0)return unavailable('Salgsprisen er endnu ikke fastlagt.');
 const timestamp=Date.parse(prices.productDate);
 if(!Number.isFinite(timestamp)||now-timestamp>=8*86400000||timestamp>now+86400000)return unavailable('Priserne skal opdateres, før de kan vises.');
 const products={},skus={};
 for(const product of catalog.products){
  const choices=[];
  for(const variant of product.variants){if(variant.discontinued)continue;const source=prices.products[variant.sku];if(!source||source.currency!=='DKK')continue;const firstTier=Math.min(...source.tiers.filter(step=>Number.isInteger(step.min)&&step.min>0).map(step=>step.min)),minimum=Number.isInteger(source.minimumDecoration)&&source.minimumDecoration>0?source.minimumDecoration:firstTier,step=tier(source.tiers,minimum);if(!Number.isInteger(minimum)||minimum<1||!step||!Number.isFinite(step.net)||step.net<0)continue;const exVat=customerGoodsUnit(step.net,product,rules,minimum);choices.push({fromExVat:exVat,fromIncVat:exVat+Math.round(exVat*.25),fromQuantity:minimum});skus[variant.sku]=true;}
  if(choices.length)products[product.id]=choices.sort((a,b)=>a.fromIncVat-b.fromIncVat||a.fromQuantity-b.fromQuantity)[0];
 }
 return {available:true,currency:'DKK',products,skus,message:''};
}
export function listPFPrintPrices(catalog,productId,sku,quantity,prices,rules,now=Date.now()){
 const unavailable=message=>({available:false,message,currency:'DKK',quantity,options:{}}),product=catalog.products.find(row=>row.id===productId),variant=product?.variants.find(row=>row.sku===sku);
 if(!product||!variant||!Number.isInteger(quantity)||quantity<1)return unavailable('Produktvariant eller antal er ugyldigt.');
 if(!prices)return unavailable('PFs trykprisfeed er ikke tilsluttet endnu.');
 if(!rules||!Number.isFinite(rules.printMarkup)||rules.printMarkup<0)return unavailable('Salgsprisen for tryk er endnu ikke fastlagt.');
 const timestamp=Date.parse(prices.printDate);if(!Number.isFinite(timestamp)||now-timestamp>=8*86400000||timestamp>now+86400000)return unavailable('Trykpriserne skal opdateres fra PF Concept.');
 const sourceProduct=prices.products?.[sku],options={};
 for(const option of variant.options){const charge=prices.prints?.[option.printCode];if(!charge||charge.currency!=='DKK')continue;const dependence=String(charge.dependence||'').toLowerCase(),colourBased=['color','colour','colors','colours'].includes(dependence),sizeBased=dependence==='size';if(!['none','color','colour','colors','colours','size'].includes(dependence))continue;
  const area=(Number(option.impWidthMm)||Number(option.impDiameterMm)||0)*(Number(option.impHeightMm)||Number(option.impDiameterMm)||0)/100,maxColours=/^\d+$/.test(String(option.maxColours||'').trim())?Number(option.maxColours):Infinity,rows=[];
  const requested=colourBased?[...new Set(charge.combinations.map(choice=>choice.colors))].filter(value=>Number.isInteger(value)&&value>=1&&value<=maxColours).sort((a,b)=>a-b):[1];
  for(const colors of requested){let choices=charge.combinations.filter(choice=>choice.setups===(colourBased?colors:1)&&choice.colors===(colourBased?colors:1));if(sizeBased){choices=choices.filter(choice=>choice.area>=area);const selectedArea=Math.min(...choices.map(choice=>choice.area));choices=choices.filter(choice=>choice.area===selectedArea);}else{const zero=choices.filter(choice=>choice.area===0);if(zero.length)choices=zero;}
   const priced=choices.map(choice=>({choice,price:tier(choice.tiers,quantity)})).filter(row=>row.price&&Number.isFinite(row.price.net)).sort((a,b)=>a.price.net-b.price.net||a.choice.setup-b.choice.setup)[0];if(!priced)continue;const ltm=sourceProduct&&Number.isFinite(sourceProduct.minimumDecoration)&&quantity<sourceProduct.minimumDecoration?charge.ltm:0;if(!Number.isFinite(ltm))continue;rows.push({colors,unitExVat:money(priced.price.net*(1+rules.printMarkup/100)),setupExVat:customerSetup(priced.choice.setup,rules),smallOrderExVat:money(ltm),areaCm2:priced.choice.area,minQuantity:priced.price.min});}
  if(rows.length)options[option.id]={method:option.impMethod,location:option.impLocation,printCode:option.printCode,dependence,rows};
 }
 return Object.keys(options).length?{available:true,message:'',currency:'DKK',quantity,minimumQuantity:Number.isInteger(sourceProduct?.minimumDecoration)&&sourceProduct.minimumDecoration>0?sourceProduct.minimumDecoration:null,options}:unavailable('Der findes ingen aktuelle trykpriser for denne variant.');
}
export async function loadPricing(){let prices=null;try{prices=JSON.parse(await readFile(dataPath('pf-prices.json'),'utf8'));}catch{}const goodsMarkup=number(process.env.PF_GOODS_MARKUP_PERCENT),printMarkup=number(process.env.PF_PRINT_MARKUP_PERCENT),setupMarkup=number(process.env.PF_SETUP_MARKUP_PERCENT),headwearGoodsMarkup=number(process.env.PF_HEADWEAR_GOODS_MARKUP_PERCENT);return {prices,rules:{goodsMarkup,printMarkup,setupMarkup,headwearGoodsMarkup}};}
export async function loadStock(){try{return JSON.parse(await readFile(dataPath('pf-stock.json'),'utf8'));}catch{return null;}}
