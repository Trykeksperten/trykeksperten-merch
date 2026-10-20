import {sanitizeDesignLine} from './design-validation.mjs';
import {persistCheckoutArtwork,validateDelivery,classifyFulfillment} from './checkout.mjs';
import {prepareOrder,dispatchOrder,readOrder} from './pf-orders.mjs';
import {gatewayConfiguration} from './pf-gateway.mjs';
import {pfAssetsForGroup} from './order-flow.mjs';
import {readTestArtwork,saveTestArtwork} from './pf-test-artwork.mjs';

const active=new Map();
export function validateCartTest(input,env=process.env){
 if(env.PF_GATEWAY_MODE!=='test')throw Error('Kurv-testordrer kan kun sendes i PF-testmiljøet.');
 if(input?.confirmation!=='TEST')throw Error('Skriv TEST for at bekræfte testordren.');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId||''))throw Error('Testreferencen mangler. Indlæs kurven igen.');
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>20)throw Error('Testkurven skal indeholde 1–20 varelinjer.');
}
export async function sendCartTest(input,options={}){
 const env=options.env||process.env;validateCartTest(input,env);
 const id=`test-${input.requestId}`;
 if(active.has(id))return active.get(id);
 const task=perform(id,input,{...options,env});active.set(id,task);
 try{return await task;}finally{active.delete(id);}
}
async function perform(id,input,{catalog,prices,rules,stock,env,fetchImpl=fetch}){
 if(!gatewayConfiguration(env).ready)throw Error('PF Gateway er ikke klar til test.');
 let record;try{record=await readTestArtwork(id);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!record){
  const lines=input.lines.map(line=>sanitizeDesignLine(catalog,line));
  if(lines.some(line=>!line.decorations.length))throw Error('Brug kun varer med tryk i denne testkurv. Den faste test kan fortsat bruges til varer uden tryk.');
  const fulfillment=classifyFulfillment(catalog,lines);
  if(fulfillment.unknownLineIndexes.length||fulfillment.groups.length!==1)throw Error('Test kun ét bekræftet produktionssted ad gangen.');
  const shipping=validateDelivery({...input.shipping,country:'DK'}),group=fulfillment.groups[0];
  record={id,status:'preparing',lines,pfColourOverrides:input.colours||{}};
  const assets=pfAssetsForGroup(record,group,{env});
  await persistCheckoutArtwork(record,input.artworks);
  // Save files separately from payments: a PF test must never look like an authorized checkout.
  await saveTestArtwork(record);
  const order=await prepareOrder({lines,productionLocation:group.location,assets,shipping:{...shipping,address:{street:shipping.street,street2:'PF TEST – MÅ IKKE PRODUCERES',postalCode:shipping.postalCode,city:shipping.city,country:'DK'}}},{catalog,prices,rules,stock,env});
  record.orderId=order.id;record.status='ready';await saveTestArtwork(record);
 }
 if(record.status!=='ready'||!record.orderId)throw Error('Testen blev ikke færdigforberedt. Indlæs kurven igen for at oprette en ny test.');
 const order=await readOrder(record.orderId);
 if(order.gatewayPayload?.Header?.isTest!==true||order.checkoutId)throw Error('Testordren har et forkert miljø.');
 // Never retry an uncertain supplier submission automatically.
 return order.status==='prepared'?dispatchOrder(order.id,{env,fetchImpl}):order;
}
