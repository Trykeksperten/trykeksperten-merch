// Read-only follow-up; input is the JSON output from audit-price-flow.mjs.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {loadPricing,loadStock,listPFProductPrices,listPFProductTiers} from '../lib/pf-pricing.mjs';
import {pricedVariants} from '../dist/pf-visibility.mjs';
import {placementOptionAssets} from '../dist/pf-rules.mjs';
import {isFoilOption} from '../dist/foil-options.mjs';
import {designGroupSize} from '../dist/design-layers.mjs';
import {prepareCheckout} from '../lib/checkout.mjs';
import {customerSummary} from '../lib/order-confirmation-view.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const {prices,rules}=await loadPricing(),stock=await loadStock();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),before=hash(rules);
const result={cases:[],unresolved:[],priceRulesUnchanged:false};
for(const c of input.blockedCases){
 const p=await loadPFProduct(c.productId),v=p.variants.find(v=>v.sku===c.sku),catalog={products:[p]};
 const row={...c,name:p.name};delete row.decorations;
 if(c.reason.includes('aktuel pris')){
  assert.ok(!pricedVariants(p,listPFProductPrices(catalog,prices,rules)).some(x=>x.sku===c.sku));
  row.outcome='Unpriced variant excluded from storefront';result.cases.push(row);continue;
 }
 const bad=v.options.find(o=>o.id===c.decorations?.[0]?.optionId);
 if(c.reason.includes('gyldigt mockup'))assert.equal(placementOptionAssets(p,bad).ready,false);
 if(c.reason.includes('kræver dekoration'))assert.notEqual(v.decorationMandatory,false);
 const available=v.options.filter(o=>o.productionLocation==='PL'&&placementOptionAssets(p,o).ready);
 const options=c.reason.includes('guld eller sølv')?available.filter(isFoilOption):available;
 const attempts=[];let passed;
 for(const o of options){
  for(const foil of isFoilOption(o)?['gold','silver']:[null]){
   const textPlacement={x:.5,y:.5,scale:.24},size=designGroupSize([],'TEST',textPlacement,o);
   const quantity=Math.max(10,listPFProductTiers(catalog,p.id,v.sku,prices,rules).minimumQuantity);
   const line={productId:p.id,sku:v.sku,quantity,decorations:[{optionId:o.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'TEST',textPlacement,...(foil?{foilFinish:foil}:{})}]};
   try{const order=prepareCheckout({lines:[line],shipping:{name:'Kontrol',email:'audit@example.invalid',phone:'12345678',street:'Testvej 1',postalCode:'2300',city:'København S',country:'DK'}},{catalog,prices,rules,stock});assert.equal(customerSummary(order).total,order.totalIncVat);attempts.push({optionId:o.id,method:o.impMethod,foil,totalIncVat:order.totalIncVat,ok:true});passed=true;}catch(e){attempts.push({optionId:o.id,foil,error:e.message});}
  }
  if(passed&&!c.reason.includes('guld eller sølv'))break;
 }
 if(!passed&&!available.length&&v.decorationMandatory===false){
  const quantity=Math.max(10,listPFProductTiers(catalog,p.id,v.sku,prices,rules).minimumQuantity);
  const line={productId:p.id,sku:v.sku,quantity,decorations:[]};
  const order=prepareCheckout({lines:[line],shipping:{name:'Kontrol',email:'audit@example.invalid',phone:'12345678',street:'Testvej 1',postalCode:'2300',city:'København S',country:'DK'}},{catalog,prices,rules,stock});
  assert.equal(customerSummary(order).total,order.totalIncVat);
  row.supplierAction='PF must supply placement image/SVG before online decoration can be offered';
  row.outcome='Blank purchase passed; decoration remains unavailable pending PF';
  row.attempts=[{blank:true,ok:true,totalIncVat:order.totalIncVat}];result.cases.push(row);continue;
 }
 if(c.reason.includes('guld eller sølv'))passed=['gold','silver'].every(finish=>attempts.some(a=>a.foil===finish&&a.ok));
 row.attempts=attempts;
 if(c.reason.includes('guld eller sølv'))row.supplierAction='Confirm PF gold/silver order codes before supplier submission';
 row.outcome=passed?(c.reason.includes('gyldigt mockup')?'Invalid placement excluded; valid alternative passed':c.reason.includes('guld eller sølv')?'Gold and silver selected and checked':'Mandatory decoration selected and checked'):'Needs supplier data or routing review';
 if(!passed)result.unresolved.push(row);
 result.cases.push(row);
}
result.priceRulesUnchanged=before===hash((await loadPricing()).rules);
result.summary={total:result.cases.length,outcomes:result.cases.reduce((counts,row)=>{counts[row.outcome]=(counts[row.outcome]||0)+1;return counts;},{}),unresolved:result.unresolved.length};
// A successful alternative does not make the original supplier placement usable.
result.supplierDependencies=result.cases.filter(row=>row.supplierAction||row.outcome==='Unpriced variant excluded from storefront').map(({productId,sku,name,supplierAction,outcome})=>({productId,sku,name,action:supplierAction||'PF must supply a current variant price; keep existing customer prices unchanged',outcome}));
console.log(JSON.stringify(result,null,2));
if(!result.priceRulesUnchanged||result.unresolved.length)process.exitCode=1;
