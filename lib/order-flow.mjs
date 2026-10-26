import {productionPaymentActive,supplierPaymentReady} from './production-payment.mjs';
import {holdForPFReview} from './pf-order-review.mjs';
import {freightContextKey} from './freight-quotes.mjs';
import {requiredOrderMockup} from './order-mockups.mjs';
import {pilotFreightExVat} from './pilot-freight.mjs';
import {decorationPantone} from './artwork-pantone.mjs';
import {pfColourPolicy,pfColourCodes} from './pf-colours.mjs';
import {hasPersonalisation,isMixedPurchase} from '../dist/purchase-flow.mjs';
import {isFoilOption,foilFinish} from '../dist/foil-options.mjs';
import {artworkURL} from './pf-artwork.mjs';
import {assertProductionColors} from '../dist/artwork-production-colors.mjs';
import {captureCheckout,checkoutConfiguration,readCheckout,updateCheckout} from './checkout.mjs';
import {dispatchOrder,prepareOrder,readOrder} from './pf-orders.mjs';
import {gatewayConfiguration} from './pf-gateway.mjs';
import {listPFStock,quotePFCart,supplierCostRules} from './pf-pricing.mjs';
import {captureQuickpay} from './quickpay.mjs';

const message=error=>String(error?.message||error).slice(0,300);
export function handoffConfiguration(env=process.env){
 const gateway=gatewayConfiguration(env),url=env.SMERCH_PUBLIC_BASE_URL||'';let secure=false;try{secure=new URL(url).protocol==='https:';}catch{}
 const reasons=[];if(env.PF_AUTO_SUBMIT_ENABLED!=='1')reasons.push('Automatisk PF-afsendelse er ikke aktiveret.');if(!gateway.ready)reasons.push('PF Gateway er ikke klar.');if(!secure)reasons.push('Offentlig HTTPS-adresse mangler.');if(!env.SMERCH_ARTWORK_SIGNING_SECRET||env.SMERCH_ARTWORK_SIGNING_SECRET.length<32)reasons.push('Signeringsnøgle til trykfiler mangler.');if(gateway.mode==='live'&&(!env.PF_WEBHOOK_SIGNING_SECRET||env.PF_WEBHOOK_SIGNING_SECRET.length<32))reasons.push('Signeret PF-relæ til status og korrekturer mangler.');if(gateway.mode==='live'&&(!env.PF_PROOF_INBOX_TOKEN||!env.PF_CALLBACK_USERNAME||!env.PF_CALLBACK_PASSWORD))reasons.push('PF-relæets indbakke- og callback-adgang mangler.');if(gateway.mode==='live'&&env.PF_WHITE_LABEL_CONFIRMED!=='1')reasons.push('Smerch som afsender er ikke bekræftet af PF.');if(gateway.mode==='live'&&env.PF_PROOF_DELIVERY_CONFIRMED!=='1')reasons.push('PF-korrekturens leveringskanal er ikke bekræftet.');
 return {ready:reasons.length===0,reasons,mode:gateway.mode};
}
function colourCodes(decoration,env,override,artworks){
 if(pfColourPolicy(decoration).kind==='fixed')return pfColourCodes(decoration);
 if(override)return pfColourCodes(decoration,override);
 if(isFoilOption(decoration))throw Error(`Bekræft PF-foliekoden for ${foilFinish(decoration.foilFinish)?.label||'den valgte folie'} før leverandørafsendelse.`);
 if(decoration.method&&pfColourPolicy(decoration).kind==='manual')throw Error(`PF-farvekoder for ${decoration.method} skal bekræftes manuelt før afsendelse.`);
 const extracted=decorationPantone(decoration,artworks);if(extracted.status==='verified')return pfColourCodes(decoration,extracted.codes);
 if(decoration.artworks?.length)throw Error('Originalfilens Pantone-farver skal kontrolleres og godkendes manuelt før PF-afsendelse.');
 let mapping;try{mapping=JSON.parse(env.SMERCH_PMS_COLOR_MAP||'{}');}catch{throw Error('PF-farvekoderne er ikke konfigureret korrekt.');}
 if(Number(decoration.colors)!==1)throw Error('Automatisk PF-afsendelse kræver afklarede Pantone-koder for flerfarvet tryk.');
 const colours=[...new Set([...(decoration.artworks||[]).flatMap(art=>art.paletteColors?.map(row=>row.target)||[art.color||'']),...(decoration.text?.trim()?[decoration.ink]:[])].filter(Boolean).map(value=>value.toLowerCase()))];
 if(colours.length!==1||!mapping[colours[0]])throw Error('Logoets eller tekstens Pantone-farvekode skal afklares før PF-afsendelse.');
 return pfColourCodes(decoration,[String(mapping[colours[0]]).trim()]);
}
export function pfAssetsForGroup(checkout,group,{env=process.env}={}){
 const assets={};for(const [localIndex,lineIndex] of group.lineIndexes.entries()){
  const line=checkout.lines[lineIndex];for(const [decorationIndex,decoration] of line.decorations.entries()){
   assertProductionColors(decoration);
   const raw=[...(decoration.artworks||[]).map(art=>artworkURL(checkout.id,art.logo.id,{env}))];
   if(decoration.text?.trim())raw.push(artworkURL(checkout.id,`text-${lineIndex}-${decorationIndex}`,{env}));
   if(!raw.length)throw Error('Trykfilen mangler.');
   const pmsColors=colourCodes(decoration,env,checkout.pfColourOverrides?.[`${lineIndex}:${decorationIndex}`],checkout.artworks);
   requiredOrderMockup(checkout,lineIndex,decorationIndex);
   assets[`${localIndex}:${decorationIndex}`]={pmsColors,files:{raw,proof:artworkURL(checkout.id,`mockup-${lineIndex}-${decorationIndex}`,{env})}};
  }
 }
 return assets;
}
export async function setPFColours(id,lineIndex,decorationIndex,codes){
 return updateCheckout(id,async order=>{
  if(!supplierPaymentReady(order))throw Error('Farver kan kun afklares på en aktiv reservation.');
  if(!Number.isInteger(lineIndex)||!Number.isInteger(decorationIndex))throw Error('Ugyldig trykplacering.');
  const decoration=order.lines?.[lineIndex]?.decorations?.[decorationIndex];if(!decoration)throw Error('Trykplaceringen findes ikke.');
  const groupIndex=order.fulfillment?.groups?.findIndex(group=>group.lineIndexes.includes(lineIndex));
  if(groupIndex<0)throw Error('Produktionsstedet mangler.');
  for(const pfId of order.pfOrderIds||[]){let pf;try{pf=await readOrder(pfId);}catch{throw Error('PF-ordren skal afstemmes før farverne kan ændres.');}if(pf.checkoutGroupIndex===groupIndex)throw Error('Farverne kan ikke ændres efter PF-ordren er oprettet.');}
  const confirmed=pfColourCodes(decoration,codes);
  order.pfColourOverrides={...(order.pfColourOverrides||{}),[`${lineIndex}:${decorationIndex}`]:confirmed};order.events.push({at:new Date().toISOString(),type:'pf_colours_confirmed',lineIndex,decorationIndex});return order;
 });
}
const handoffLocks=new Map();
export async function handoffAuthorizedCheckout(id,options={}){
 const previous=handoffLocks.get(id)||Promise.resolve(),task=previous.catch(()=>{}).then(()=>handoffAuthorizedCheckoutLocked(id,options));handoffLocks.set(id,task);try{return await task;}finally{if(handoffLocks.get(id)===task)handoffLocks.delete(id);}
}
async function handoffAuthorizedCheckoutLocked(id,{env=process.env,catalog,prices,rules,stock,dispatch=dispatchOrder}={}){
 const checkout=await readCheckout(id);if(checkout.adminTest)throw Error('Administratorens betalingstest må ikke sendes til PF.');if(!supplierPaymentReady(checkout))return checkout;
 if(await holdForPFReview(id))return readCheckout(id);
 if(env.PF_GATEWAY_MODE==='live'&&checkout.paymentProvider==='quickpay'&&checkout.paymentMode!=='live')throw Error('En testbetaling eller betaling uden bekræftet live-status må ikke sendes til PF-produktion.');
 const config=handoffConfiguration(env);if(!config.ready){await updateCheckout(id,order=>{order.pfHandoff={status:'blocked',reason:config.reasons.join(' ')};return order;});return readCheckout(id);}
 if(!checkout.fulfillment?.groups?.length||checkout.fulfillment.unknownLineIndexes?.length)throw Error('Produktionsstederne er ikke afklaret.');
 validateRenewal(checkout,{catalog,prices,rules,stock,env});
 for(const [index,group] of checkout.fulfillment.groups.entries()){
  try{const assets=pfAssetsForGroup(checkout,group,{env}),input={checkoutId:id,checkoutGroupIndex:index,productionLocation:group.location,lines:group.lineIndexes.map(lineIndex=>checkout.lines[lineIndex]),shipping:{...checkout.shipping,address:{street:checkout.shipping.street,postalCode:checkout.shipping.postalCode,city:checkout.shipping.city,country:checkout.shipping.country}},assets};
   const pfOrder=await prepareOrder(input,{catalog,prices,rules,stock,env});await updateCheckout(id,order=>{order.pfOrderIds=[...new Set([...(order.pfOrderIds||[]),pfOrder.id])];order.pfHandoff={status:'prepared'};return order;});if(pfOrder.status==='prepared')await dispatch(pfOrder.id,{env});
  }catch(error){await updateCheckout(id,order=>{order.pfHandoff={status:'blocked',reason:message(error)};order.events.push({at:new Date().toISOString(),type:'pf_handoff_blocked',message:message(error)});return order;});break;}
 }
 const updated=await readCheckout(id);if(updated.pfOrderIds?.length===updated.fulfillment.groups.length&&updated.pfHandoff?.status!=='blocked')await updateCheckout(id,order=>{order.pfHandoff={status:'submitted'};return order;});return readCheckout(id);
}
export async function allLatestProofsApproved(checkout){
 if(!checkout.pfOrderIds?.length||checkout.pfOrderIds.length!==checkout.fulfillment.groups.length)return false;
 const orders=await Promise.all(checkout.pfOrderIds.map(readOrder));return orders.every(order=>order.checkoutId===checkout.id&&order.pfOrderNumber&&order.proof&&order.decision?.decision==='approve'&&order.decision.actor==='customer'&&order.decision.proofHash===order.proof.hash&&Number(order.decision.version)===Number(order.proof.version)&&['approval_pending_pf','approval_recorded'].includes(order.status));
}
export async function checkoutReadyForCapture(checkout){
 if(isMixedPurchase(checkout.lines))return false;

 if(!checkout.lines?.length||!checkout.pfOrderIds?.length||checkout.pfOrderIds.length!==checkout.fulfillment?.groups?.length)return false;
 const orders=await Promise.all(checkout.pfOrderIds.map(readOrder));
 return orders.every(order=>order.checkoutId===checkout.id&&order.pfOrderNumber&&order.status==='shipped'&&order.shipment?.isOrderComplete===true&&Number.isFinite(Date.parse(order.shipment?.shipDate))&&Date.parse(order.shipment.shipDate)<=Date.now());
}
export async function captureApprovedCheckout(id,{env=process.env,fetchImpl=fetch}={}){
 const order=await readCheckout(id);if(order.paymentProvider==='bank_transfer')throw Error('Bankbetaling skal afstemmes manuelt og må ikke hæves via kortudbyderen.');if(order.adminTest)throw Error('Administratorens betalingstest må ikke hæves.');if(isMixedPurchase(order.lines))throw Error('Varer med og uden tryk skal betales i hver sin ordre.');if(order.paymentProvider==='quickpay'){if(env.QUICKPAY_CAPTURE_ENABLED!=='1')throw Error('Quickpay-hævning er endnu ikke aktiveret.');return captureQuickpay(id,{env,fetchImpl,canCapture:checkoutReadyForCapture});}
 if(env.STRIPE_CAPTURE_ENABLED!=='1')throw Error('Stripe-hævning er endnu ikke aktiveret.');return captureCheckout(id,{env,fetchImpl,canCapture:checkoutReadyForCapture});
}
export function validateRenewal(order,{catalog,prices,rules,stock,env=process.env}){
 const quote=quotePFCart(catalog,order.lines,prices,order.adminPilot&&order.pricingMode==='supplier_cost'?supplierCostRules(rules):rules),config=checkoutConfiguration(env),freight=order.freightQuote?order.freightGroups.map(group=>group.exVat):order.fulfillment.groups.map(group=>order.adminPilot&&order.pricingMode==='supplier_cost'&&pilotFreightExVat(order.lines)!==null?pilotFreightExVat(order.lines):group.kind==='blank'?config.blankShipping.freightExVat:(config.freightByLocation[group.location]??(order.fulfillment.groups.length===1?config.freightExVat:null)));
 if(order.freightQuote&&(order.freightQuote.contextKey!==freightContextKey({lines:order.lines,shipping:order.shipping,deliveryMethod:order.deliveryMethod||'STD',goodsTotalIncVat:quote.totalIncVat,groups:order.fulfillment.groups})||order.freightQuote.customerExVat!==order.freightExVat||order.freightQuote.customerIncVat!==order.freightIncVat))throw Error('Den accepterede fragt matcher ikke ordren. Afstem før ny betaling.');
 if(quote.totalIncVat!==order.quote.totalIncVat||freight.some(value=>value===null)||freight.reduce((sum,value)=>sum+value,0)!==order.freightExVat)throw Error('Pris eller fragt er ændret. Kunden skal have et nyt samlet tilbud før ny betaling.');
 const availability=listPFStock(catalog,stock),needed=new Map();for(const line of order.lines)needed.set(line.sku,(needed.get(line.sku)||0)+line.quantity);
 if(!availability.available||[...needed].some(([sku,quantity])=>(availability.items[sku]?.available??0)<quantity))throw Error('Lageret er ændret. Ordren skal afklares før ny betaling.');
 return true;
}
