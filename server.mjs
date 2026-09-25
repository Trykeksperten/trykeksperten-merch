import {listPFPrintPrices,listPFProductPrices,listPFProductTiers,listPFStock,loadPricing,loadStock,quotePFCart} from './lib/pf-pricing.mjs';
import {authorized,callbackAuthorized,proofInboxAuthorized,gatewayTestOrderInput,prepareOrder,dispatchOrder,readOrder,listOrders,applyPFNotification,recordProof,readProofFile,decideProof,recordApprovalDelivery,recordExternalApproval} from './lib/pf-orders.mjs';
import {createAdminSession,adminSessionAuthorized,closeAdminSession,loginAllowed} from './lib/admin-auth.mjs';
import {gatewayRequirements} from './lib/pf-gateway.mjs';
import {applyStripeEvent,cancelCheckout,checkoutConfiguration,checkoutFulfillmentAssessment,checkoutPublic,createStripeSession,listCheckouts,persistCheckout,persistCheckoutArtwork,prepareCheckout,readCheckout,reauthorizeCheckout,refreshAuthorizationExpiry,updateCheckout,verifyStripeEvent} from './lib/checkout.mjs';
import {readSignedArtwork} from './lib/pf-artwork.mjs';
import {verifyPFRelaySignature} from './lib/webhook-signing.mjs';
import {applyQuickpayCallback,cancelQuickpay,createQuickpayLink,renewQuickpay,verifyQuickpayCallback} from './lib/quickpay.mjs';
import {captureApprovedCheckout,handoffAuthorizedCheckout,handoffConfiguration,pfAssetsForGroup,setPFColours,validateRenewal} from './lib/order-flow.mjs';
import {generatePreview} from './lib/ai-preview.mjs';
import {loadEnvFile} from 'node:process';
try{loadEnvFile();}catch(error){if(error.code!=='ENOENT')throw error;}
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicCatalog } from './lib/catalog.mjs';
import {sanitizeDesignLine} from './lib/design-validation.mjs';
import {loadCatalogIndex,loadPFProduct,loadProductCatalog} from './lib/pf-catalog-store.mjs';
import {parsePFPlacementSVG,stripPFPlacementGuide} from './lib/pf-placement.mjs';
const root=resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const pdfRoot=resolve(fileURLToPath(new URL('./node_modules/pdfjs-dist/build/',import.meta.url)));
const port=Number(process.env.PORT||5173);
const host=process.env.HOST||'0.0.0.0';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const placementCache=new Map();
const placementArtCache=new Map();
async function readJSON(req,limit=1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON kræves.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Anmodningen er for stor.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
async function readPFRelayJSON(req,limit=1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON kræves.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Anmodningen er for stor.');chunks.push(chunk);}const raw=Buffer.concat(chunks),secret=process.env.PF_WEBHOOK_SIGNING_SECRET;if((secret||process.env.PF_GATEWAY_MODE==='live')&&!verifyPFRelaySignature(raw,req.headers,secret))throw Error('PF-relæets signatur mangler eller er ugyldig.');return JSON.parse(raw.toString());}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));}
async function quoteOnlyProductIds(catalog,priceResult){
 try{const config=JSON.parse(await readFile(new URL('./data/pf-quote-only.json',import.meta.url),'utf8'));
  const known=new Set(catalog.products.map(product=>product.id));
  return [...new Set(Array.isArray(config.productIds)?config.productIds:[])].filter(id=>known.has(id)&&!priceResult.products[id]);
 }catch{return [];}
}
const handleRequest=async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/health'&&['GET','HEAD'].includes(req.method)){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok'}));return;}
 if(req.url==='/api/checkout/status'&&req.method==='GET'){json(res,200,checkoutConfiguration());return;}
 if(req.url==='/api/checkout/fulfillment'&&req.method==='POST'){try{const input=await readJSON(req),lines=input.lines;if(!Array.isArray(lines)||lines.length>20)throw Error();const catalog=await loadProductCatalog(lines.map(line=>line.productId));json(res,200,checkoutFulfillmentAssessment(catalog,lines,checkoutConfiguration().freightByLocation));}catch{json(res,400,{error:'Forsendelserne kunne ikke vurderes.'});}return;}
 if(req.url==='/api/checkout/session'&&req.method==='POST'){
  const base=process.env.SMERCH_PUBLIC_BASE_URL;let expected;try{expected=new URL(base).origin;}catch{}
  if(!expected||req.headers.origin!==expected||req.headers.host!==new URL(expected).host){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  try{const input=await readJSON(req,30*1024*1024),catalog=await loadProductCatalog(input.lines?.map(line=>line.productId)||[]),{prices,rules}=await loadPricing(),stock=await loadStock();const order=prepareCheckout(input,{catalog,prices,rules,stock});if(checkoutConfiguration().mode==='live'){const handoff=handoffConfiguration();if(!handoff.ready)throw Error(handoff.reasons.join(' '));for(const group of order.fulfillment.groups)pfAssetsForGroup(order,group);}await persistCheckoutArtwork(order,input.artworks);await persistCheckout(order);if(order.paymentProvider==='quickpay'){const session=await createQuickpayLink(order.id);json(res,201,{id:order.id,url:session.url});}else{const session=await createStripeSession(order);order.stripeSessionId=session.id;order.status='awaiting_payment';order.updatedAt=new Date().toISOString();await persistCheckout(order);json(res,201,{id:order.id,url:session.url});}}catch(error){json(res,400,{error:error.message||'Betaling kunne ikke startes.'});}return;
 }
 const reauthorizePath=/^\/api\/checkout\/(pay-[a-f0-9-]{36})\/reauthorize$/.exec(new URL(req.url,'http://localhost').pathname);
 if(reauthorizePath&&req.method==='POST'){const base=process.env.SMERCH_PUBLIC_BASE_URL;let origin;try{origin=new URL(base).origin;}catch{}if(!origin||req.headers.origin!==origin||req.headers.host!==new URL(origin).host){json(res,403,{error:'Ugyldig oprindelse.'});return;}try{const existing=await readCheckout(reauthorizePath[1]),renew=existing.paymentProvider==='quickpay'?renewQuickpay:reauthorizeCheckout;json(res,200,await renew(reauthorizePath[1],{validate:async order=>{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();validateRenewal(order,{catalog,prices,rules,stock});}}));}catch(error){json(res,400,{error:error.message});}return;}
 if(req.url?.startsWith('/api/checkout/')&&req.method==='GET'){
  try{const id=new URL(req.url,'http://localhost').pathname.split('/').at(-1),order=await readCheckout(id),view=checkoutPublic(order);view.pfOrders=await Promise.all((order.pfOrderIds||[]).map(async pfId=>{try{const pfOrder=await readOrder(pfId);return {status:pfOrder.status,tracking:pfOrder.shipment?.tracking||[],carrier:pfOrder.shipment?.carrier||null};}catch{return {status:'afventer',tracking:[],carrier:null};}}));json(res,200,view);}catch{json(res,404,{error:'Ordren blev ikke fundet.'});}return;
 }
 if(req.url==='/api/quickpay/callback'&&req.method==='POST'){
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Quickpay-callback er for stor.');chunks.push(chunk);}const raw=Buffer.concat(chunks);if(!verifyQuickpayCallback(raw,req.headers['quickpay-checksum-sha256'],process.env.QUICKPAY_PRIVATE_KEY))throw Error('Ugyldig Quickpay-signatur.');const order=await applyQuickpayCallback(JSON.parse(raw.toString()));if(order?.status==='authorized'){try{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();await handoffAuthorizedCheckout(order.id,{catalog,prices,rules,stock});}catch(error){await updateCheckout(order.id,current=>{current.pfHandoff={status:'blocked',reason:error.message};return current;});}}json(res,200,{received:true});}catch(error){json(res,400,{error:error.message||'Callback kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/stripe/webhook'&&req.method==='POST'){
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Webhook er for stor.');chunks.push(chunk);}const event=verifyStripeEvent(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET),order=await applyStripeEvent(event);if(order?.status==='authorized'&&event.type==='payment_intent.amount_capturable_updated'){try{await refreshAuthorizationExpiry(order.id);}catch{}try{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();await handoffAuthorizedCheckout(order.id,{catalog,prices,rules,stock});}catch(error){await updateCheckout(order.id,checkout=>{checkout.pfHandoff={status:'blocked',reason:error.message};return checkout;});}}json(res,200,{received:true});}catch(error){json(res,400,{error:error.message||'Webhook kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/admin/login'&&req.method==='POST'){
  try{if(!loginAllowed(req)){json(res,429,{error:'For mange forsøg. Prøv igen senere.'});return;}const input=await readJSON(req,8192);if(createAdminSession(req,res,input)){json(res,200,{authenticated:true});return;}json(res,401,{error:'Forkert brugernavn eller adgangskode.'});}catch{json(res,400,{error:'Login kunne ikke gennemføres.'});}return;
 }
 if(req.url==='/api/admin/session'&&req.method==='GET'){json(res,200,{authenticated:adminSessionAuthorized(req)});return;}
 if(req.url==='/api/admin/logout'&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Du er ikke logget ind.'});return;}closeAdminSession(req,res);json(res,200,{authenticated:false});return;}
 if(req.url==='/api/admin/checkouts'&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{json(res,200,(await listCheckouts()).map(order=>({id:order.id,status:order.status,paymentProvider:order.paymentProvider||'stripe',quickpayPaymentId:order.quickpayPaymentId||null,createdAt:order.createdAt,authorizedAt:order.authorizedAt||null,authorizationExpiresAt:order.authorizationExpiresAt||null,paidAt:order.paidAt||null,totalIncVat:order.totalIncVat,pfOrderIds:order.pfOrderIds||[],pfHandoff:order.pfHandoff||null,pfColourOverrides:order.pfColourOverrides||{},shipping:order.shipping,artworks:order.artworks?.map(({id,name,size})=>({id,name,size}))||[],lines:order.lines.map(line=>({productId:line.productId,sku:line.sku,quantity:line.quantity,decorations:line.decorations.map(deco=>({method:deco.method,position:deco.position,colors:deco.colors,text:deco.text,logos:deco.artworks?.map(art=>art.logo.name)||[]}))}))})));}catch{json(res,500,{error:'Betalingerne kunne ikke indlæses.'});}return;}
 const colourPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/colours$/.exec(new URL(req.url,'http://localhost').pathname);
 if(colourPath&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const input=await readJSON(req,8192),order=await setPFColours(colourPath[1],input.lineIndex,input.decorationIndex,input.codes);json(res,200,{id:order.id,pfColourOverrides:order.pfColourOverrides});}catch(error){json(res,400,{error:error.message});}return;}
 const checkoutAction=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/(retry-handoff|capture|cancel)$/.exec(new URL(req.url,'http://localhost').pathname);
 if(checkoutAction&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const id=checkoutAction[1];if(checkoutAction[2]==='capture'){const order=await captureApprovedCheckout(id);json(res,200,checkoutPublic(order));}else if(checkoutAction[2]==='cancel'){const existing=await readCheckout(id),order=await (existing.paymentProvider==='quickpay'?cancelQuickpay:cancelCheckout)(id);json(res,200,checkoutPublic(order));}else{const order=await readCheckout(id),catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();json(res,200,checkoutPublic(await handoffAuthorizedCheckout(id,{catalog,prices,rules,stock})));}}catch(error){json(res,400,{error:error.message});}return;}
 const artworkPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/artwork\/([a-f0-9-]{36})$/.exec(new URL(req.url,'http://localhost').pathname);
 if(artworkPath&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const order=await readCheckout(artworkPath[1]),asset=order.artworks?.find(item=>item.id===artworkPath[2]);if(!asset)throw Error();const data=await readFile(asset.path);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${asset.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}).end(data);}catch{json(res,404,{error:'Logofilen blev ikke fundet.'});}return;}
 if(req.url?.startsWith('/api/pf-artwork?')&&req.method==='GET'){try{const asset=await readSignedArtwork(new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':asset.mimeType,'Content-Disposition':`attachment; filename="${asset.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Robots-Tag':'noindex, nofollow'}).end(asset.data);}catch{json(res,404,{error:'Trykfilen blev ikke fundet.'});}return;}
 const adminPath=req.url?.startsWith('/api/pf-orders');
 if(adminPath){
  if(!authorized(req,process.env.PF_ORDER_ADMIN_TOKEN)&&!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname==='/api/pf-orders/status'&&req.method==='GET'){json(res,200,{...gatewayRequirements(),automaticHandoff:handoffConfiguration(),captureEnabled:process.env.PAYMENT_PROVIDER==='quickpay'?process.env.QUICKPAY_CAPTURE_ENABLED==='1':process.env.STRIPE_CAPTURE_ENABLED==='1'});return;}
   if(pathname==='/api/pf-orders/test'&&req.method==='POST'){
    const input=await readJSON(req);
    const catalog=await loadProductCatalog(['pf-38687']),{prices,rules}=await loadPricing(),stock=await loadStock();
    const order=await prepareOrder(gatewayTestOrderInput(input),{catalog,prices,rules,stock});
    const sent=await dispatchOrder(order.id);
    json(res,201,{id:sent.id,purchaseOrderNumber:sent.purchaseOrderNumber,status:sent.status,gatewayResponse:sent.gatewayResponse,test:true,paymentCreated:false});return;
   }
   if(pathname==='/api/pf-orders'&&req.method==='GET'){json(res,200,(await listOrders()).map(({gatewayPayload,lines,supplierTotal,...order})=>({...order,lines:lines.map(({supplierUnitPrice,...line})=>line)})));return;}
   if(pathname==='/api/pf-orders'&&req.method==='POST'){const input=await readJSON(req,2*1024*1024);if(input.checkoutId)throw Error('Kundeordrer oprettes kun gennem det interne betalingsflow.');const catalog=await loadProductCatalog(input.lines?.map(line=>line.productId)||[]),{prices,rules}=await loadPricing(),stock=await loadStock(),order=await prepareOrder(input,{catalog,prices,rules,stock});json(res,201,{id:order.id,status:order.status,quote:order.quote});return;}
   const match=/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})(?:\/(send|proof|proof-file|decision|approval-delivery|external-approval))?$/.exec(pathname);
   if(match){const [,id,action]=match;if(req.method==='GET'&&!action){json(res,200,await readOrder(id));return;}if(req.method==='GET'&&action==='proof-file'){const version=new URL(req.url,'http://localhost').searchParams.get('version'),proof=await readProofFile(id,version);res.writeHead(200,{'Content-Type':proof.mimeType,'Content-Disposition':'inline','Content-Security-Policy':'sandbox','X-Frame-Options':'SAMEORIGIN'}).end(proof.data);return;}if(req.method==='POST'&&action==='send'){const order=await dispatchOrder(id);json(res,200,{id:order.id,status:order.status,gatewayResponse:order.gatewayResponse});return;}if(req.method==='POST'&&action==='proof'){const order=await recordProof(id,await readJSON(req,15*1024*1024));json(res,200,{id:order.id,status:order.status,proof:order.proof});return;}if(req.method==='POST'&&action==='decision'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må godkende kundeordrer.');const order=await decideProof(id,await readJSON(req));let captureIssue=null;if(order.checkoutId&&order.decision?.decision==='approve'){try{await captureApprovedCheckout(order.checkoutId);}catch(error){captureIssue=error.message;}}json(res,200,{id:order.id,status:order.status,decision:order.decision,captureIssue});return;}if(req.method==='POST'&&action==='approval-delivery'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må registrere godkendelse til PF.');const order=await recordApprovalDelivery(id,await readJSON(req));json(res,200,{id:order.id,status:order.status,decision:order.decision});return;}if(req.method==='POST'&&action==='external-approval'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må frigive kundeordrer.');const order=await recordExternalApproval(id,await readJSON(req));json(res,200,{id:order.id,status:order.status,proof:order.proof});return;}}
   json(res,404,{error:'Ordrehandlingen findes ikke.'});
  }catch(error){json(res,400,{error:error.message||'Ordren kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/pf-proof-inbox'&&req.method==='POST'){
  if(!proofInboxAuthorized(req)){json(res,401,{error:'Adgang til korrekturindbakken kræves.'});return;}
  try{const input=await readPFRelayJSON(req,15*1024*1024),reference=String(input.purchaseOrderNumber||'');if(!/^SMERCH-[a-f0-9-]{36}$/.test(reference))throw Error('Ordreferencen mangler.');if(!input.messageId)throw Error('Besked-id kræves.');const order=await recordProof(`ord-${reference.slice(7)}`,{...input,source:'inbox'});json(res,200,{received:true,orderId:order.id,version:order.proof.version});}catch(error){json(res,400,{error:error.message||'Korrekturen kunne ikke modtages.'});}return;
 }
 if(req.url?.startsWith('/api/pf-callback/')&&req.method==='POST'){
  if(!callbackAuthorized(req)){json(res,401,{error:'PF-adgang kræves.'});return;}
  try{const kind=new URL(req.url,'http://localhost').pathname.split('/').at(-1),order=await applyPFNotification(kind,await readPFRelayJSON(req));if(order.checkoutId&&order.shipment)await updateCheckout(order.checkoutId,checkout=>{checkout.shipment={...(checkout.shipment||{}),[order.id]:order.shipment};return checkout;});json(res,200,{received:true,orderId:order.id});}catch(error){json(res,400,{error:error.message||'PF-beskeden kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/ai-status'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:process.env.AI_ENABLED==='1'&&Boolean(process.env.OPENAI_API_KEY)}));return;}
 if(req.url==='/api/pf-product-prices'&&req.method==='GET'){
  try{const catalog=await loadCatalogIndex();const {prices,rules}=await loadPricing(),result=listPFProductPrices(catalog,prices,rules);result.quoteOnlyIds=await quoteOnlyProductIds(catalog,result);result.comingSoonIds=result.available?catalog.products.filter(product=>product.brandId==='citizen-green'&&!result.products[product.id]&&product.variants.some(variant=>!variant.discontinued)).map(product=>product.id):[];res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({available:false,message:'Priserne kunne ikke indlæses.',products:{},skus:{},quoteOnlyIds:[],comingSoonIds:[]}));}return;
 }
 if(req.url?.startsWith('/api/pf-print-prices?')&&req.method==='GET'){
  try{const query=new URL(req.url,'http://localhost').searchParams,productId=query.get('productId')||'',sku=query.get('sku')||'',quantity=Number(query.get('quantity')),catalog=await loadProductCatalog([productId]),{prices,rules}=await loadPricing();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(listPFPrintPrices(catalog,productId,sku,quantity,prices,rules)));}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({available:false,message:'Trykpriserne kunne ikke indlæses.',currency:'DKK',options:{}}));}return;
 }
 if(req.url?.startsWith('/api/pf-product-tiers?')&&req.method==='GET'){
  try{const query=new URL(req.url,'http://localhost').searchParams,productId=query.get('productId')||'',sku=query.get('sku')||'',catalog=await loadProductCatalog([productId]),{prices,rules}=await loadPricing();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(listPFProductTiers(catalog,productId,sku,prices,rules)));}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({available:false,message:'Mængdepriserne kunne ikke indlæses.',tiers:[]}));}return;
 }
 if(req.url==='/api/pf-stock'&&req.method==='GET'){
  try{const catalog=await loadCatalogIndex(),stock=await loadStock();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(listPFStock(catalog,stock)));}catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({available:false,message:'Lagerstatus kunne ikke indlæses.',items:{}}));}return;
 }
 if(req.url?.startsWith('/api/pf-placement?')&&req.method==='GET'){
  try{
   const source=new URL(req.url,'http://localhost').searchParams.get('src'),url=new URL(source);
   if(url.protocol!=='https:'||url.hostname!=='imagedata.pfconcept.com'||!url.pathname.startsWith('/2d/models/')||!url.pathname.endsWith('.svg'))throw Error();
   let bounds=placementCache.get(url.href);
   if(!bounds){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const length=Number(response.headers.get('content-length')||0);if(length>8*1024*1024)throw Error();const svg=await response.text();if(svg.length>8*1024*1024)throw Error();bounds=parsePFPlacementSVG(svg);placementCache.set(url.href,bounds);while(placementCache.size>500)placementCache.delete(placementCache.keys().next().value);}
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(bounds));
  }catch{res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'PF-trykfladen kunne ikke aflæses.'}));}return;
 }
 if(req.url?.startsWith('/api/pf-placement-art?')&&req.method==='GET'){
  try{
   const source=new URL(req.url,'http://localhost').searchParams.get('src'),url=new URL(source);
   if(url.protocol!=='https:'||url.hostname!=='imagedata.pfconcept.com'||!url.pathname.startsWith('/2d/models/')||!url.pathname.endsWith('.svg'))throw Error();
   let svg=placementArtCache.get(url.href);
   if(!svg){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();svg=await response.text();if(svg.length>8*1024*1024)throw Error();svg=stripPFPlacementGuide(svg);placementArtCache.set(url.href,svg);while(placementArtCache.size>200)placementArtCache.delete(placementArtCache.keys().next().value);}
   res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8'}).end(svg);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Placeringsbilledet kunne ikke indlæses.');}return;
 }
 if(req.url==='/api/pf-quote'&&req.method==='POST'){
  if(req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error();chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString());if(!Array.isArray(body.lines)||body.lines.length>100)throw Error();const catalog=await loadProductCatalog(body.lines.map(line=>line.productId));const {prices,rules}=await loadPricing();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(quotePFCart(catalog,body.lines,prices,rules)));}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Kurven kunne ikke prisberegnes.'}));}return;
 }
 if(req.url==='/api/design-check'&&req.method==='POST'){
  const allowed=[`localhost:${port}`,`127.0.0.1:${port}`],origin=req.headers.origin;
  if(!allowed.includes(req.headers.host)||(origin&&origin!==`http://${req.headers.host}`)||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Designet er for stort.');chunks.push(chunk);}const input=JSON.parse(Buffer.concat(chunks).toString()),catalog=await loadProductCatalog([input.line?.productId]),line=sanitizeDesignLine(catalog,input.line);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({line,status:'validated'}));}catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message||'Designet kunne ikke kontrolleres.'}));}return;
 }
 if(req.url==='/api/ai-preview' &&req.method==='POST'){
  const allowed=[`localhost:${port}`,`127.0.0.1:${port}`];
  if(!allowed.includes(req.headers.host)||req.headers.origin!==`http://${req.headers.host}`||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
  try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Error('Filen er for stor.');chunks.push(chunk);}
   const input=JSON.parse(Buffer.concat(chunks).toString());const catalog=await loadProductCatalog([input.productId]);
   const result=await generatePreview(catalog,input);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.name==='TimeoutError'?'Billedgenereringen tog for lang tid. Prøv igen senere.':error.message}));}return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
 try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(path==='/vendor/pdf.mjs'||path==='/vendor/pdf.worker.mjs'){
  const data=await readFile(resolve(pdfRoot,path.endsWith('worker.mjs')?'pdf.worker.mjs':'pdf.mjs'));
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(req.method==='HEAD'?undefined:data);return;
 }
 if(path==='/api/pf-catalog'){const data=JSON.stringify(await loadCatalogIndex());res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:data);return;}
 if(/^\/api\/pf-product\/pf-[a-z0-9]+$/i.test(path)){const product=await loadPFProduct(path.split('/').at(-1));if(!product){res.writeHead(404).end('Produktet findes ikke');return;}const data=JSON.stringify(product);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:data);return;}
 if(path==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(publicCatalog()));return;}
 const isPage=/^\/design\/pf-[a-z0-9]+$/i.test(path)||path==='/'||path==='/produkter'||path==='/brands'||path==='/specialproduktion'||path==='/demokurv'||path==='/kurv'||path==='/betaling'||path==='/ordre'||path==='/kontakt'||path==='/gennemgang'||/^\/produkt\/[a-z0-9-]+$/.test(path);
 const file=path==='/admin'?resolve(root,'admin-dashboard.html'):path==='/admin/pf-orders'?resolve(root,'pf-orders-admin.html'):isPage?resolve(root,'index.html'):resolve(root,'.'+path);
 if(!file.startsWith(root+sep)||!types[extname(file)]){res.writeHead(404).end('Siden findes ikke');return;}
 const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]}).end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404).end('Siden findes ikke');}
};
const server=createServer(handleRequest);
server.on('error',e=>{console.error(e.message);process.exit(1)});
server.listen(port,host,()=>console.log(`Smerch server listening on ${host}:${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
const syncMinutes=Number(process.env.PF_PRICE_SYNC_INTERVAL_MINUTES||60);
const hasPriceFeeds=Boolean((process.env.PF_PRICE_FEED_URL||process.env.PF_PRICE_FILE)&&(process.env.PF_PRINT_PRICE_FEED_URL||process.env.PF_PRINT_PRICE_FILE)&&(process.env.PF_STOCK_FEED_URL||process.env.PF_STOCK_FILE));
if(hasPriceFeeds&&Number.isFinite(syncMinutes)&&syncMinutes>=15){
 let syncing=false;
 const sync=()=>{if(syncing)return;syncing=true;const child=spawn(process.execPath,[fileURLToPath(new URL('./scripts/sync-pf-prices.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:'ignore'});child.on('error',()=>{syncing=false;console.error('PF-feedsynkronisering kunne ikke startes. Tidligere priser er bevaret.');});child.on('exit',code=>{syncing=false;if(code!==0)console.error('PF-feedsynkronisering mislykkedes. Tidligere priser er bevaret.');});};
 setTimeout(sync,60_000).unref();
 setInterval(sync,syncMinutes*60_000).unref();
}
