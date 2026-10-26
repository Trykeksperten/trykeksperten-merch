import {bankInvoiceBasis} from './lib/bank-invoice-basis.mjs';
import {prepareBankPayment,registerBankPaymentAndHandoff,publicBankPayment} from './lib/bank-payment.mjs';
import {publicPFDelivery} from './dist/order-delivery-status.mjs';
import {pfReviewState,approvePFReview} from './lib/pf-order-review.mjs';
import {recordCheckoutMarketing} from './lib/checkout-marketing.mjs';
import {requestFreight,freightStatus,listFreightRequests,approveFreight,freightMarkup,acceptedFreight,claimFreight} from './lib/freight-quotes.mjs';
import {financeSummary} from './lib/sales-finance.mjs';
import {salesBasisPDF} from './lib/sales-basis.mjs';
import {withLedger,financeConfiguration,financeView,reconcileSalesShipments,readLedger,saveVerifiedPayment,updateFinance} from './lib/sales-ledger.mjs';
import {executeSalesPayment,reconcileSalesPayment} from './lib/sales-payments.mjs';
import {sendFinanceMail,queueAccountantBasis} from './lib/sales-mail.mjs';
import {processSalesFinance} from './lib/sales-worker.mjs';
import {orderConfirmationStatus,releaseOrderConfirmation} from './lib/order-mail.mjs';
import {retryProofMailRecord} from './lib/proof-mail.mjs';
import {automationSettings,saveAutomationSettings} from './lib/automation-settings.mjs';
import {shipmentMailStatus,sendShipmentMail,reconcileShipmentMail,processShipmentMail} from './lib/shipment-mail.mjs';
import {sendOrderDocument} from './lib/order-document-send.mjs';
import {companySettings,saveCompanySettings,documentSeed,documentEligibility,reviewDocument,createOrderDocument,readOrderDocument,listOrderDocuments} from './lib/order-documents.mjs';
import {resendOptions,prepareResend,sendResend,readResendDraft} from './lib/order-resend.mjs';
import {readCorrespondence,addCorrespondence} from './lib/order-correspondence.mjs';
import {readTestOrderMockup} from './lib/pf-test-artwork.mjs';
import {pfTestEnvironment} from './lib/pf-test-env.mjs';
import {orderMockups,requiredOrderMockup} from './lib/order-mockups.mjs';
import {applyPilotColour} from './lib/pilot-colour.mjs';
import {pilotFreightExVat} from './lib/pilot-freight.mjs';
import {startPopularitySync} from './lib/pf-popularity.mjs';
import {inspectArtworkPantone,decorationPantone} from './lib/artwork-pantone.mjs';
const pantoneAllowed=createAddressLimiter();
import {proofMailboxStatus,proofMailboxItems,connectProofMailbox,processProofMailbox,reviewMailboxItem} from './lib/pf-proof-mailbox.mjs';
import {receiveProof,proofIntakeStatus,reviewProofIntake} from './lib/proof-intake.mjs';
import {readPFCallback} from './lib/pf-callback.mjs';
import {pfColourPolicy} from './lib/pf-colours.mjs';
import {savePFConfirmation,readPFConfirmation} from './lib/pf-confirmations.mjs';
import {supplierCostRules} from './lib/pf-pricing.mjs';
import {assertAdminCheckoutTest,assertAdminLiveTest,prepareAdminLiveTest,assertAdminPilot,prepareAdminPilot} from './lib/admin-checkout-test.mjs';
import {sendCartTest,validateCartTest} from './lib/pf-cart-test.mjs';
import {economicConfiguration,syncEconomicInvoice,syncEconomicInvoices} from './lib/economic-invoices.mjs';
import {searchDanishAddresses,resolveDanishAddress,verifyDeliveryAddress,createAddressLimiter} from './lib/danish-address.mjs';
const addressAllowed=createAddressLimiter();
import {companyProductPreview,listCompanyProducts,saveCompanyProduct,archiveCompanyProduct,companySelection,resolveCompanyCart} from './lib/company-products.mjs';
import {configureCompanyAccount,companyAccounts,companyLoginAllowed,companyMutationAuthorized,createCompanySession,companySession,closeCompanySession} from './lib/company-auth.mjs';
import {checkoutRequestAuthorized,adminRequestOriginAllowed} from './lib/payment-origin.mjs';
import {retryProofMail,proofMailStatus} from './lib/proof-mail.mjs';
import {publishCustomerProof,customerProof,customerProofFile,readFeedbackFile} from './lib/pf-orders.mjs';
import {sendPublicJSON} from './lib/json-response.mjs';
import {launchConfig,launchMessage,blocksLaunchOrder} from './dist/launch-config.mjs';
import {sanitizeSpecial,sendSpecial} from './lib/special-inquiry.mjs';
import {recordStatistics,statisticsReport} from './lib/shop-statistics.mjs';
import {isPolandProduct} from './lib/pf-shipping-origin.mjs';
import {saveSalePrices,readSalePriceState} from './lib/sale-prices.mjs';
import {readAssortment,publicAssortment,setVisibility,adminProduct,isVisibleProduct} from './lib/assortment.mjs';
import {validateBilling} from './lib/billing.mjs';
import {queueOrderConfirmation,retryOrderConfirmations} from './lib/order-mail.mjs';
import {legalPage,legalPaths} from './lib/legal-pages.mjs';
import {subscribeMarketing,unsubscribeMarketing,recordWithdrawal,deliverWithdrawalReceipt,retryWithdrawalReceipts,listMarketing,listWithdrawals} from './lib/legal-services.mjs';
import {validateCheckoutConsent} from './dist/legal-consent.mjs';
import {listProductDocuments,downloadProductDocument} from './lib/pf-documents.mjs';
import {adminPriceSummary,adminProductPricing,listPFPrintPrices,listPFProductPrices,listPFProductTiers,listPFStock,loadPricing,loadStock,quotePFCart,estimatePFLine} from './lib/pf-pricing.mjs';
import {authorized,callbackAuthorized,proofInboxAuthorized,gatewayTestOrderInput,prepareOrder,dispatchOrder,readOrder,listOrders,applyPFNotificationBatch,recordProof,readProofFile,decideProof,recordApprovalDelivery,recordExternalApproval} from './lib/pf-orders.mjs';
import {createAdminSession,adminSessionActor,adminSessionAuthorized,closeAdminSession,loginAllowed} from './lib/admin-auth.mjs';
import {gatewayRequirements} from './lib/pf-gateway.mjs';
import {applyStripeEvent,cancelCheckout,checkoutConfiguration,checkoutFulfillmentAssessment,checkoutPublic,createStripeSession,listCheckouts,persistCheckout,persistCheckoutArtwork,prepareCheckout,validateDelivery,readCheckout,reauthorizeCheckout,refreshAuthorizationExpiry,updateCheckout,verifyStripeEvent} from './lib/checkout.mjs';
import {readSignedArtwork} from './lib/pf-artwork.mjs';
import {verifyPFRelaySignature} from './lib/webhook-signing.mjs';
import {refreshQuickpayStatus,paymentStatusSummary,getQuickpayPayment,applyQuickpayCallback,cancelQuickpay,createQuickpayLink,renewQuickpay,verifyQuickpayCallback} from './lib/quickpay.mjs';
import {captureApprovedCheckout,handoffAuthorizedCheckout,handoffConfiguration,pfAssetsForGroup,setPFColours,validateRenewal} from './lib/order-flow.mjs';
import {generatePreview} from './lib/ai-preview.mjs';
import {contactConfiguration,sanitizeContact,sendContact} from './lib/contact.mjs';
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
import {seoPage,seoHead,seoMain,sitemapXML,robotsTXT} from './dist/seo-pages.mjs';
import {parsePFPlacementSVG,stripPFPlacementGuide,highlightPFPlacementGuide} from './lib/pf-placement.mjs';
const root=resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const pdfRoot=resolve(fileURLToPath(new URL('./node_modules/pdfjs-dist/build/',import.meta.url)));
const port=Number(process.env.PORT||5173);
const host=process.env.HOST||'0.0.0.0';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.ico':'image/x-icon'};
const placementCache=new Map();
const placementArtCache=new Map();
const contactAttempts=new Map();
const statisticsAttempts=new Map();
function statisticsAllowed(req){const now=Date.now(),key=req.socket.remoteAddress||'local';let entry=statisticsAttempts.get(key);if(!entry||entry.until<now){if(statisticsAttempts.size>=10000)statisticsAttempts.delete(statisticsAttempts.keys().next().value);entry={count:0,until:now+60000};statisticsAttempts.set(key,entry);}return ++entry.count<=600;}

async function readJSON(req,limit=1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON kræves.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Anmodningen er for stor.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
async function readPFRelayJSON(req,limit=1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON kræves.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Anmodningen er for stor.');chunks.push(chunk);}const raw=Buffer.concat(chunks),secret=process.env.PF_WEBHOOK_SIGNING_SECRET;if((secret||process.env.PF_GATEWAY_MODE==='live')&&!verifyPFRelaySignature(raw,req.headers,secret))throw Error('PF-relæets signatur mangler eller er ugyldig.');return JSON.parse(raw.toString());}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));}
function contactAllowed(req,now=Date.now()){const key=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim(),recent=(contactAttempts.get(key)||[]).filter(time=>now-time<10*60_000);if(recent.length>=5){contactAttempts.set(key,recent);return false;}recent.push(now);contactAttempts.set(key,recent);return true;}
async function quoteOnlyProductIds(catalog,priceResult){
 try{const config=JSON.parse(await readFile(new URL('./data/pf-quote-only.json',import.meta.url),'utf8'));
  const known=new Set(catalog.products.map(product=>product.id));
  return [...new Set(Array.isArray(config.productIds)?config.productIds:[])].filter(id=>known.has(id)&&!priceResult.products[id]);
 }catch{return [];}
}
const handleRequest=async(req,res)=>{
 if(blocksLaunchOrder(new URL(req.url,'http://localhost').pathname,req.method)){json(res,503,{error:launchMessage});return;}
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(/^\/(?:api|admin)(?:\/|$)/.test(new URL(req.url,'http://localhost').pathname))res.setHeader('X-Robots-Tag','noindex');
 if(req.url==='/health'&&['GET','HEAD'].includes(req.method)){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok'}));return;}
 const legalURL=new URL(req.url,'http://localhost');
 const customerPath=/^\/api\/customer-proofs\/(ord-[a-f0-9-]{36})(?:\/(file|decision))?$/.exec(legalURL.pathname);
 if(customerPath){
  res.setHeader('Referrer-Policy','no-referrer');
  const [,id,action]=customerPath,token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  try{
   if(req.method==='GET'&&!action){json(res,200,await customerProof(id,token));return;}
   if(req.method==='GET'&&action==='file'){const proof=await customerProofFile(id,token);res.writeHead(200,{'Content-Type':proof.mimeType,'Content-Disposition':'inline','Content-Security-Policy':'sandbox','X-Frame-Options':'SAMEORIGIN'}).end(proof.data);return;}
   if(req.method==='POST'&&action==='decision'){
    if(req.headers.origin!==`https://${req.headers.host}`&&req.headers.origin!==`http://${req.headers.host}`)throw Error('Ugyldig oprindelse.');
    await customerProof(id,token);
    const input=await readJSON(req,22*1024*1024);
    if(input.decision==='approve'&&input.confirmed!==true)throw Error('Bekræft, at du har gennemgået korrekturen.');
    await decideProof(id,{version:input.version,decision:input.decision,comment:input.comment,attachments:input.decision==='reject'?input.attachments:[],customerToken:token});
    retryProofMail().catch(()=>{});
    json(res,200,await customerProof(id,token));return;
   }
   json(res,405,{error:'Handlingen er ikke tilladt.'});
  }catch(error){json(res,400,{error:error.code==='ENOENT'?'Linket er ugyldigt eller udløbet.':error.message});}return;
 }

 if(legalURL.pathname==='/api/shop-statistics'&&req.method==='POST'){
  let same=false;try{const origin=new URL(req.headers.origin);same=['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{}
  if(!same){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  if(adminSessionAuthorized({headers:req.headers,method:'GET'})||/bot|crawler|spider|headless/i.test(String(req.headers['user-agent']||''))){res.writeHead(204).end();return;}
  if(!statisticsAllowed(req)){res.writeHead(429).end();return;}
  try{const input=await readJSON(req,2048);await recordStatistics(input.events);res.writeHead(204).end();}catch{json(res,400,{error:'Hændelsen kunne ikke registreres.'});}return;
 }
 if(legalURL.pathname==='/api/admin/statistics'&&req.method==='GET'){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{json(res,200,await statisticsReport({days:Number(legalURL.searchParams.get('days')||7)}));}catch{json(res,400,{error:'Statistikken kunne ikke indlæses.'});}return;
 }
 if(legalPaths.has(legalURL.pathname)&&['GET','HEAD'].includes(req.method)){
  try{const body=await legalPage(legalURL.pathname,legalURL.searchParams);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}).end(req.method==='HEAD'?undefined:body);}catch{json(res,500,{error:'Siden kunne ikke indlæses.'});}return;
 }
 if(['/api/legal/withdrawal','/api/marketing/subscribe','/api/marketing/unsubscribe'].includes(req.url)&&req.method==='POST'){
  let same=false;try{same=new URL(req.headers.origin).host===req.headers.host;}catch{}
  if(!same){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  if(!contactAllowed(req)){json(res,429,{error:'For mange anmodninger. Prøv igen senere. / Too many requests. Try again later.'});return;}
  try{const input=await readJSON(req,8192);
   if(req.url==='/api/legal/withdrawal'){const record=await recordWithdrawal(input);let emailSent=false;try{emailSent=await deliverWithdrawalReceipt(record);}catch{}json(res,201,{id:record.id,receivedAt:record.receivedAt,receipt:record.receipt,emailSent});}
   else json(res,200,await (req.url.endsWith('/unsubscribe')?unsubscribeMarketing:subscribeMarketing)(input));
  }catch(error){json(res,400,{error:error.message||'Anmodningen kunne ikke gemmes.'});}return;
 }
 if(['/api/admin/marketing','/api/admin/withdrawals'].includes(req.url)&&req.method==='GET'){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{json(res,200,await(req.url.endsWith('/marketing')?listMarketing:listWithdrawals)());}catch{json(res,500,{error:'Oplysningerne kunne ikke hentes.'});}return;
 }
 if(req.url==='/api/contact/status'&&req.method==='GET'){json(res,200,{ready:contactConfiguration().ready,email:'hello@smerch.dk'});return;}
 if(['/api/contact','/api/special-inquiry'].includes(req.url)&&req.method==='POST'){
  const expectedHost=req.headers.host,origin=req.headers.origin;let validOrigin=false;try{validOrigin=new URL(origin).host===expectedHost;}catch{}
  if(!validOrigin){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  if(!contactAllowed(req)){json(res,429,{error:'Der er sendt for mange beskeder. Prøv igen om lidt.'});return;}
  try{const special=req.url==='/api/special-inquiry';const inquiry=(special?sanitizeSpecial:sanitizeContact)(await readJSON(req,special?22*1024*1024:16*1024));if(inquiry.website){json(res,201,{sent:true});return;}await (special?sendSpecial:sendContact)(inquiry);json(res,201,{sent:true});}catch(error){const unavailable=/ikke færdigkonfigureret/.test(error.message);json(res,unavailable?503:400,{error:unavailable?'Mailforbindelsen er ved at blive gjort klar. Skriv direkte til hello@smerch.dk indtil da.':error.message||'Beskeden kunne ikke sendes.'});}return;
 }
 if(req.url==='/api/artwork/pantone'&&req.method==='POST'){
  if(!checkoutRequestAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  const key=String(req.socket.remoteAddress||'unknown');if(!pantoneAllowed(key)){json(res,429,{error:'Prøv igen senere.'});return;}
  try{const input=await readJSON(req,7*1024*1024);if(typeof input.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))throw Error();const bytes=Buffer.from(input.base64,'base64');if(bytes.length>5*1024*1024)throw Error();const {status,codes}=await inspectArtworkPantone(bytes);json(res,200,{status,codes});}catch{json(res,400,{error:'Farverne skal kontrolleres manuelt.'});}return;
 }
 if(legalURL.pathname==='/api/addresses'&&req.method==='POST'){
  if(!checkoutRequestAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  const key=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  if(!addressAllowed(key)){json(res,429,{error:'For mange adressesøgninger. Prøv igen om et minut.'});return;}
  try{const input=await readJSON(req,2048);json(res,200,input.id?await resolveDanishAddress(input.id):await searchDanishAddresses(input));}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/admin/checkout-pilot/quote'&&req.method==='POST'){
  if(!adminSessionAuthorized(req)){json(res,403,{error:'Administratoradgang kræves.'});return;}
  try{const input=await readJSON(req),catalog=await loadProductCatalog(input.lines.map(line=>line.productId)),{prices,rules}=await loadPricing();res.setHeader('Cache-Control','no-store');json(res,200,{...quotePFCart(catalog,input.lines,prices,supplierCostRules(rules)),internalFreightExVat:pilotFreightExVat(input.lines)});}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/admin/checkout-pilot/status'&&req.method==='GET'){
  if(!adminSessionAuthorized(req)){json(res,403,{error:'Administratoradgang kræves.'});return;}
  try{assertAdminPilot(true);const config=checkoutConfiguration(),handoff=handoffConfiguration();json(res,200,{...config,ready:config.ready&&handoff.ready,reason:config.reason||handoff.reasons.join(' '),adminPilot:true});}catch(error){json(res,200,{ready:false,reason:error.message});}return;
 }
 if(['/api/admin/checkout-test/status','/api/admin/checkout-live-test/status'].includes(req.url)&&req.method==='GET'){
  try{const live=req.url.includes('checkout-live-test');(live?assertAdminLiveTest:assertAdminCheckoutTest)(adminSessionAuthorized(req));json(res,200,{...checkoutConfiguration(),adminTest:true,adminLiveTest:live,testAmountIncVat:live?500:null});}catch(error){json(res,403,{error:error.message});}return;
 }
 if(req.url==='/api/checkout/freight'&&req.method==='POST'){
  if(!checkoutRequestAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  try{const input=await readJSON(req,256*1024),context=await freightContext(input,req);if(input.goodsTotalIncVat!==context.goodsTotalIncVat)throw Error('Vareprisen er ændret. Genindlæs kurven, før fragten beregnes.');res.setHeader('Cache-Control','private, no-store');if(input.action==='status'){json(res,200,await freightStatus(input.id,input.token,context));return;}if(input.action!=='request')throw Error('Ukendt fragthandling.');if(!contactAllowed(req)){json(res,429,{error:'For mange fragtforespørgsler. Prøv igen senere.'});return;}json(res,201,await requestFreight(context));}catch(error){json(res,400,{error:error.message});}return;
 }
 const freightAdmin=/^\/api\/admin\/freight-quotes(?:\/(freight-[a-f0-9-]{36}))?$/.exec(legalURL.pathname);
 if(freightAdmin){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{res.setHeader('Cache-Control','private, no-store');if(req.method==='GET'&&!freightAdmin[1]){json(res,200,{requests:await listFreightRequests(),markupExVat:freightMarkup()});return;}if(req.method==='POST'&&freightAdmin[1]&&adminRequestOriginAllowed(req)){json(res,200,await approveFreight(freightAdmin[1],await readJSON(req,16384),{actor:adminSessionActor(req)}));return;}json(res,405,{error:'Handlingen er ikke tilladt.'});}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/checkout/status'&&req.method==='GET'){json(res,200,{...checkoutConfiguration(),...(!launchConfig.ordersEnabled?{ready:false,reason:launchMessage}:{}),launch:launchConfig});return;}
 if(req.url==='/api/checkout/fulfillment'&&req.method==='POST'){try{const input=await readJSON(req),resolved=await resolveCompanyCart(input.lines,await companySession(req),{loadCatalog:loadProductCatalog}),lines=resolved.lines;if(!Array.isArray(lines)||lines.length>20)throw Error();const catalog=await loadProductCatalog(lines.map(line=>line.productId));json(res,200,checkoutFulfillmentAssessment(catalog,lines,checkoutConfiguration().freightByLocation,checkoutConfiguration()));}catch{json(res,400,{error:'Forsendelserne kunne ikke vurderes.'});}return;}
 if(['/api/checkout/session','/api/admin/checkout-test/session','/api/admin/checkout-live-test/session','/api/admin/checkout-pilot/session'].includes(req.url)&&req.method==='POST'){
  const pilot=req.url==='/api/admin/checkout-pilot/session';
  if(pilot){try{assertAdminPilot(adminSessionAuthorized(req));}catch(error){json(res,403,{error:error.message});return;}}
  const liveTest=req.url==='/api/admin/checkout-live-test/session',adminTest=liveTest||req.url==='/api/admin/checkout-test/session';
  if(adminTest){try{(liveTest?assertAdminLiveTest:assertAdminCheckoutTest)(adminSessionAuthorized(req));}catch(error){json(res,403,{error:error.message});return;}}
  if(!checkoutRequestAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  try{const input=await readJSON(req,40*1024*1024);input.shipping=await verifyDeliveryAddress(input.shipping);const company=await companySession(req),resolved=await resolveCompanyCart(input.lines,company,{loadCatalog:loadProductCatalog,includeFiles:true});input.lines=resolved.lines;const trustedIds=new Set(resolved.artworks.map(file=>file.id));input.artworks=[...(Array.isArray(input.artworks)?input.artworks:[]).filter(file=>!trustedIds.has(file.id)),...resolved.artworks];const catalog=await loadProductCatalog(input.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();if(catalog.products.some(p=>!isPolandProduct(p)))throw Error('En vare i kurven kan ikke længere bestilles. Webshoppen tilbyder nu kun varer fra Polen. Fjern varen fra kurven.');const configForFreight=checkoutConfiguration(),freightApproval=!adminTest&&!pilot&&configForFreight.freightQuoteRequired?await acceptedFreight(input.freightQuote,await freightContext(input,req)):null,order=prepareCheckout(input,{catalog,prices,rules,stock,atSupplierCost:pilot,allowTestFreight:adminTest,freightApproval}),legal=validateCheckoutConsent(input.legal,Date.now(),{personalised:order.lines.some(line=>line.decorations.length>0)});order.adminTest=adminTest;if(pilot)prepareAdminPilot(order);if(liveTest)prepareAdminLiveTest(order);order.legal=legal;if(resolved.references.length){order.companyId=company.id;order.companyTemplates=resolved.references;}order.billing=validateBilling(input.billing,legal.customerType,order.shipping);if(legal.customerType==='business'&&['street','postalCode','city','country'].some(k=>!order.billing[k]))throw Error('Udfyld fakturaadresse, postnummer, by og land.');const deliveryTerms=checkoutConfiguration().deliveryTerms?.[legal.locale];if(!deliveryTerms)throw Error('Leveringstiden skal afklares før onlinebestilling.');order.legal.deliveryTerms=deliveryTerms;if(!adminTest&&!contactConfiguration().ready)throw Error('Ordrebekræftelse på e-mail skal være klar før onlinebestilling.');order.legal.documents={terms:await readFile(new URL(`./dist/legal/terms-${legal.locale}.html`,import.meta.url),'utf8'),privacy:await readFile(new URL(`./dist/legal/privacy-${legal.locale}.html`,import.meta.url),'utf8')};await persistCheckoutArtwork(order,input.artworks);if(pilot)applyPilotColour(order);if(checkoutConfiguration().mode==='live'){const handoff=handoffConfiguration();if(!handoff.ready)throw Error(handoff.reasons.join(' '));for(const group of order.fulfillment.groups)pfAssetsForGroup(order,group);}if(freightApproval)await claimFreight(freightApproval,order.id);await recordCheckoutMarketing(order,input.marketing);if(input.paymentMethod==='bank_transfer'){if(input.bankPrepaymentAccepted!==true)throw Error('Acceptér forudbetaling via bankoverførsel.');prepareBankPayment(order);order.legal.bankPrepaymentAcceptedAt=new Date().toISOString();}else if(input.paymentMethod&&input.paymentMethod!=='card')throw Error('Ukendt betalingsmetode.');await persistCheckout(order);if(order.paymentProvider==='bank_transfer'){await queueOrderConfirmation(order);retryOrderConfirmations().catch(()=>{});json(res,201,{id:order.id,url:'/ordre?checkout='+encodeURIComponent(order.id)});}else if(order.paymentProvider==='quickpay'){const session=await createQuickpayLink(order.id);json(res,201,{id:order.id,url:session.url});}else{const session=await createStripeSession(order);order.stripeSessionId=session.id;order.status='awaiting_payment';order.updatedAt=new Date().toISOString();await persistCheckout(order);json(res,201,{id:order.id,url:session.url});}}catch(error){json(res,400,{error:error.message||'Betaling kunne ikke startes.'});}return;
 }
 const reauthorizePath=/^\/api\/(?:checkout|admin\/checkout-pilot)\/(pay-[a-f0-9-]{36})\/reauthorize$/.exec(new URL(req.url,'http://localhost').pathname);
 if(reauthorizePath&&req.method==='POST'){if(!checkoutRequestAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}try{const existing=await readCheckout(reauthorizePath[1]);if(existing.adminPilot)assertAdminPilot(adminSessionAuthorized(req));else if(req.url.startsWith('/api/admin/checkout-pilot/')||!launchConfig.ordersEnabled)throw Error(launchMessage);const renew=existing.paymentProvider==='quickpay'?renewQuickpay:reauthorizeCheckout;json(res,200,await renew(reauthorizePath[1],{validate:async order=>{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();validateRenewal(order,{catalog,prices,rules,stock});}}));}catch(error){json(res,400,{error:error.message});}return;}
 if(req.url?.startsWith('/api/checkout/')&&req.method==='GET'){
  try{const id=new URL(req.url,'http://localhost').pathname.split('/').at(-1),order=await readCheckout(id),view=checkoutPublic(order);view.bankPayment=publicBankPayment(order);view.pfOrders=await Promise.all((order.pfOrderIds||[]).map(async pfId=>{try{const pfOrder=await readOrder(pfId);return publicPFDelivery(pfOrder);}catch{return {status:'afventer',tracking:[],carrier:null};}}));json(res,200,view);}catch{json(res,404,{error:'Ordren blev ikke fundet.'});}return;
 }
 if(req.url==='/api/quickpay/callback'&&req.method==='POST'){
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Quickpay-callback er for stor.');chunks.push(chunk);}const raw=Buffer.concat(chunks);if(!verifyQuickpayCallback(raw,req.headers['quickpay-checksum-sha256'],process.env.QUICKPAY_PRIVATE_KEY))throw Error('Ugyldig Quickpay-signatur.');let payment=JSON.parse(raw.toString());if(financeConfiguration().enabled){const known=(await listCheckouts()).find(o=>o.quickpayPaymentId===payment.id&&o.quickpayOrderId===payment.order_id);if(known)payment=await getQuickpayPayment(known);}const order=await applyQuickpayCallback(payment);if(order&&financeConfiguration().enabled)await saveVerifiedPayment(order,payment);if(order?.status==='authorized'&&!order.adminTest){await queueOrderConfirmation(order);retryOrderConfirmations().catch(()=>{});try{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();await handoffAuthorizedCheckout(order.id,{catalog,prices,rules,stock});}catch(error){await updateCheckout(order.id,current=>{current.pfHandoff={status:'blocked',reason:error.message};return current;});}}json(res,200,{received:true});}catch(error){json(res,400,{error:error.message||'Callback kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/stripe/webhook'&&req.method==='POST'){
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Webhook er for stor.');chunks.push(chunk);}const event=verifyStripeEvent(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET),order=await applyStripeEvent(event);if(order?.status==='authorized'&&event.type==='payment_intent.amount_capturable_updated'){await queueOrderConfirmation(order);retryOrderConfirmations().catch(()=>{});try{await refreshAuthorizationExpiry(order.id);}catch{}try{const catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();await handoffAuthorizedCheckout(order.id,{catalog,prices,rules,stock});}catch(error){await updateCheckout(order.id,checkout=>{checkout.pfHandoff={status:'blocked',reason:error.message};return checkout;});}}json(res,200,{received:true});}catch(error){json(res,400,{error:error.message||'Webhook kunne ikke behandles.'});}return;
 }
 const companyAccountPath=/^\/api\/admin\/companies\/([a-z0-9-]+)\/account$/.exec(legalURL.pathname);
 if(companyAccountPath){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}if(req.method!=='POST'){json(res,405,{error:'Handlingen er ikke tilladt.'});return;}try{json(res,200,await configureCompanyAccount(companyAccountPath[1],await readJSON(req,8192)));}catch(error){json(res,400,{error:error.message});}return;}
 const companyAdmin=/^\/api\/admin\/companies(?:\/([a-z0-9-]+)\/products(?:\/([a-f0-9-]{36}))?)?$/.exec(legalURL.pathname);
 if(companyAdmin){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{const [,companyId,productId]=companyAdmin,accounts=await companyAccounts();
   if(!companyId&&req.method==='GET'){json(res,200,accounts.filter(a=>a.enabled!==false).map(a=>({id:a.id,name:a.name,username:a.username,configured:Boolean(a.passwordHash)})));return;}
   if(!accounts.some(a=>a.id===companyId&&a.enabled!==false))throw Error('Virksomheden findes ikke.');
   if(req.method==='GET'&&!productId){json(res,200,await listCompanyProducts(companyId));return;}
   if(req.method==='POST'&&!productId){const input=await readJSON(req,30*1024*1024),catalog=await loadProductCatalog([input.line?.productId]);json(res,201,await saveCompanyProduct(companyId,input,{catalog}));return;}
   if(req.method==='POST'&&productId){await archiveCompanyProduct(companyId,productId);json(res,200,{archived:true});return;}
   json(res,405,{error:'Handlingen er ikke tilladt.'});
  }catch(error){json(res,400,{error:error.message});}return;
 }
 if(legalURL.pathname.startsWith('/api/company/')){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  const action=legalURL.pathname.slice('/api/company/'.length);
  try{
   const preview=/^previews\/([a-f0-9-]{36})\/(\d+)$/.exec(action);if(preview&&req.method==='GET'){const company=await companySession(req);if(!company)throw Error('Virksomhedslogin kræves.');const bytes=await companyProductPreview(company.id,preview[1],Number(preview[2]));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(bytes);return;}
   if(action==='products'&&req.method==='GET'){const company=await companySession(req);if(!company){json(res,401,{error:'Virksomhedslogin kræves.'});return;}json(res,200,await listCompanyProducts(company.id));return;}
   if(action==='selection'&&req.method==='POST'){if(!companyMutationAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}const company=await companySession(req),input=await readJSON(req,8192);json(res,200,await companySelection(company,input,{loadCatalog:loadProductCatalog}));return;}
   if(action==='session'&&req.method==='GET'){const company=await companySession(req);json(res,200,{authenticated:Boolean(company),...(company?{company}:{})});return;}
   if(req.method!=='POST'||!['login','logout'].includes(action)){json(res,404,{error:'Siden findes ikke.'});return;}
   if(!companyMutationAuthorized(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
   if(action==='logout'){closeCompanySession(req,res);json(res,200,{authenticated:false});return;}
   if(!companyLoginAllowed(req)){json(res,429,{error:'For mange loginforsøg. Prøv igen om 15 minutter.'});return;}
   const input=await readJSON(req,4096);
   if(!await createCompanySession(req,res,input)){json(res,401,{error:'Forkert brugernavn eller adgangskode.'});return;}
   json(res,200,{authenticated:true});
  }catch{json(res,400,{error:'Login kunne ikke gennemføres. Prøv igen.'});}return;
 }
 if(req.url==='/api/admin/login'&&req.method==='POST'){
  try{if(!loginAllowed(req)){json(res,429,{error:'For mange forsøg. Prøv igen senere.'});return;}const input=await readJSON(req,8192);if(createAdminSession(req,res,input)){json(res,200,{authenticated:true});return;}json(res,401,{error:'Forkert brugernavn eller adgangskode.'});}catch{json(res,400,{error:'Login kunne ikke gennemføres.'});}return;
 }
 if(req.url==='/api/admin/session'&&req.method==='GET'){json(res,200,{authenticated:adminSessionAuthorized(req)});return;}
 if(req.url==='/api/admin/logout'&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Du er ikke logget ind.'});return;}closeAdminSession(req,res);json(res,200,{authenticated:false});return;}
 const adminPricePath=/^\/api\/admin\/products\/(pf-[a-z0-9]+)\/prices$/i.exec(req.url||'');
 if(adminPricePath&&['GET','POST'].includes(req.method)){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  res.setHeader('Cache-Control','no-store');
  try{const catalog=await loadCatalogIndex(),{prices,rules}=await loadPricing(),id=adminPricePath[1];if(req.method==='POST'){const input=await readJSON(req,32768),product=catalog.products.find(p=>p.id===id),variant=product?.variants.find(v=>v.sku===input.sku);if(!variant)throw Error('Produktvarianten findes ikke.');const automatic=listPFProductTiers(catalog,id,input.sku,prices,{...rules,salePrices:{}});if(input.tiers!==null&&!automatic.available)throw Error(automatic.message);if(input.scope!==undefined&&!['product','variant'].includes(input.scope))throw Error('Vælg produkt eller variant.');const productWide=input.scope!=='variant';rules.salePrices=await saveSalePrices(productWide?id:input.sku,input.tiers,{minimum:automatic.minimumQuantity||1,productWide,clearSkus:productWide?product.variants.map(v=>v.sku):[],durationMinutes:input.tiers===null?0:(input.durationMinutes??0)});rules.salePriceExpirations=(await readSalePriceState()).expirations;}json(res,200,{...adminProductPricing(catalog,id,prices,rules),summary:adminPriceSummary(catalog.products.find(p=>p.id===id),prices,rules)});}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/admin/products'&&['GET','POST'].includes(req.method)){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{const catalog=await loadCatalogIndex();if(req.method==='POST'){const input=await readJSON(req,4096);const state=await setVisibility(input.id,input.visible,catalog);json(res,200,adminProduct(catalog.products.find(p=>p.id===input.id),state));}else{const state=await readAssortment(),{prices,rules}=await loadPricing();res.setHeader('Cache-Control','no-store');json(res,200,{products:catalog.products.map(p=>({...adminProduct(p,state),priceSummary:adminPriceSummary(p,prices,rules)}))});}}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/admin/invoices/status'&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}json(res,200,economicConfiguration());return;}
 const invoicePath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/invoice$/.exec(legalURL.pathname);
 if(invoicePath&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{json(res,200,await syncEconomicInvoice(invoicePath[1]));}catch(error){json(res,400,{error:error.message});}return;}
 const adminMockupImage=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/mockup\/(\d+)\/(\d+)$/.exec(legalURL.pathname);
 if(adminMockupImage&&req.method==='GET'){
  if(!adminSessionAuthorized(req)){json(res,403,{error:'Administratoradgang kræves.'});return;}
  try{
   const order=await readCheckout(adminMockupImage[1]);
   const mockup=requiredOrderMockup(order,Number(adminMockupImage[2]),Number(adminMockupImage[3]));
   const bytes=Buffer.from(mockup.base64,'base64');
   res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).end(bytes);
  }catch{json(res,404,{error:'Mockuppet blev ikke fundet.'});}return;
 }
 const mockupPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/mockups$/.exec(new URL(req.url,'http://localhost').pathname);
 if(mockupPath&&['GET','POST'].includes(req.method)){
  if(!adminSessionAuthorized(req)){json(res,403,{error:'Administratoradgang kræves.'});return;}
  try{const order=await readCheckout(mockupPath[1]);res.setHeader('Cache-Control','no-store');
   if(req.method==='GET'){json(res,200,{id:order.id,lines:order.lines,catalog:await loadProductCatalog(order.lines.map(l=>l.productId)),saved:order.mockups?.length||0});}
   else{const input=await readJSON(req,9*1024*1024),mockups=orderMockups(input.mockups,order.lines),expected=order.lines.reduce((n,l)=>n+l.decorations.length,0);if(!expected||mockups.length!==expected||new Set(input.mockups.map(m=>m.lineIndex+':'+m.decorationIndex)).size!==expected)throw Error('Der skal være et gyldigt mockup for hver placering.');if(order.mockups?.length)throw Error('Ordren har allerede mockups.');await updateCheckout(order.id,current=>{if(current.mockups?.length)throw Error('Ordren har allerede mockups.');current.mockups=mockups;current.events.push({at:new Date().toISOString(),type:'mockups_restored',count:mockups.length});return current;});json(res,200,{saved:mockups.length});}
  }catch(error){json(res,400,{error:error.message});}return;
 }
 const paymentStatusPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/payment-status$/.exec(legalURL.pathname);
 if(paymentStatusPath&&req.method==='POST'){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  if(!adminRequestOriginAllowed(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}
  try{const order=await refreshQuickpayStatus(paymentStatusPath[1]);json(res,200,paymentStatusSummary(order));}catch(error){json(res,400,{error:error.message});}return;
 }
 if(req.url==='/api/admin/checkouts'&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const sales=await readLedger();json(res,200,(await listCheckouts()).map(order=>({id:order.id,finance:sales.orders[order.id]?financeSummary(order,sales.orders[order.id]):null,productNames:order.productNames||{},status:order.status,paymentProvider:order.paymentProvider||'stripe',paymentMode:order.paymentMode||null,adminTest:order.adminTest===true,adminLiveTest:order.adminLiveTest===true,adminPilot:order.adminPilot===true,invoice:order.invoice||null,bankPayment:publicBankPayment(order),...paymentStatusSummary(order),quickpayPaymentId:order.quickpayPaymentId||null,createdAt:order.createdAt,authorizedAt:order.authorizedAt||null,authorizationExpiresAt:order.authorizationExpiresAt||null,paidAt:order.paidAt||null,totalIncVat:order.totalIncVat,pfOrderIds:order.pfOrderIds||[],pfHandoff:order.pfHandoff||null,pfReview:pfReviewState(order),pfColourOverrides:order.pfColourOverrides||{},shipping:order.shipping,billing:order.billing||null,artworks:order.artworks?.map(({id,name,size})=>({id,name,size}))||[],mockups:(order.mockups||[]).flatMap(item=>{const match=/^mockup-(\d+)-(\d+)\.png$/.exec(item.filename);return match?[{lineIndex:Number(match[1])-1,decorationIndex:Number(match[2])-1}]:[];}),fulfillmentGroups:(order.fulfillment?.groups||[]).map(group=>group.lineIndexes),lines:order.lines.map(line=>({productId:line.productId,sku:line.sku,quantity:line.quantity,decorations:line.decorations.map(deco=>({method:deco.method,pfFixedColour:pfColourPolicy(deco).code||null,pantone:decorationPantone(deco,order.artworks),position:deco.position,colors:deco.colors,text:deco.text,logos:deco.artworks?.map(art=>art.logo.name)||[]}))}))})));}catch{json(res,500,{error:'Betalingerne kunne ikke indlæses.'});}return;}
 const colourPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/colours$/.exec(new URL(req.url,'http://localhost').pathname);
 if(colourPath&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const input=await readJSON(req,8192),order=await setPFColours(colourPath[1],input.lineIndex,input.decorationIndex,input.codes);json(res,200,{id:order.id,pfColourOverrides:order.pfColourOverrides});}catch(error){json(res,400,{error:error.message});}return;}
 const bankBasis=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/invoice-basis$/.exec(new URL(req.url,'http://localhost').pathname);
 if(bankBasis&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}try{const html=bankInvoiceBasis(await readCheckout(bankBasis[1]));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}).end(html);}catch(error){json(res,400,{error:error.message});}return;}
 const bankAction=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/bank-payment$/.exec(new URL(req.url,'http://localhost').pathname);
 if(bankAction&&req.method==='POST'){
  if(!adminSessionAuthorized(req)||!adminRequestOriginAllowed(req)){json(res,403,{error:'Medarbejderlogin og gyldig oprindelse kræves.'});return;}
  try{const input=await readJSON(req,8192),order=await registerBankPaymentAndHandoff(bankAction[1],input,{actor:adminSessionActor(req),handoff:async paid=>{const catalog=await loadProductCatalog(paid.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();return handoffAuthorizedCheckout(paid.id,{catalog,prices,rules,stock});}});json(res,200,{...checkoutPublic(order),bankPayment:publicBankPayment(order),pfHandoff:order.pfHandoff});}catch(error){json(res,400,{error:error.message});}return;
 }
 const reviewApproval=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/approve-handoff$/.exec(new URL(req.url,'http://localhost').pathname);
 if(reviewApproval&&req.method==='POST'){
  if(!adminSessionAuthorized(req)||!adminRequestOriginAllowed(req)){json(res,403,{error:'Medarbejderlogin og gyldig oprindelse kræves.'});return;}
  try{const input=await readJSON(req,8192);if(input.confirmed!==true)throw Error('Bekræft gennemgangen af ordren.');const order=await approvePFReview(reviewApproval[1],{expectedKey:input.reviewKey,actor:adminSessionActor(req)}),catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();const result=await handoffAuthorizedCheckout(order.id,{catalog,prices,rules,stock});json(res,200,{id:result.id,pfHandoff:result.pfHandoff});}catch(error){json(res,400,{error:error.message});}return;
 }
 const checkoutAction=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/(retry-handoff|capture|cancel)$/.exec(new URL(req.url,'http://localhost').pathname);
 if(checkoutAction&&req.method==='POST'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const id=checkoutAction[1];if(checkoutAction[2]==='capture'){if(financeConfiguration().enabled){await reconcileSalesShipments(id);const v=await financeView(id);json(res,200,await executeSalesPayment(id,{kind:'capture',amount:v.summary.shipped-v.summary.captured,key:'shipment-capture:'+v.summary.shipped}));}else{const order=await captureApprovedCheckout(id);json(res,200,checkoutPublic(order));}}else if(checkoutAction[2]==='cancel'){const existing=await readCheckout(id),order=await (financeConfiguration().enabled?withLedger(()=> (existing.paymentProvider==='quickpay'?cancelQuickpay:cancelCheckout)(id)):(existing.paymentProvider==='quickpay'?cancelQuickpay:cancelCheckout)(id));json(res,200,checkoutPublic(order));}else{const order=await readCheckout(id),catalog=await loadProductCatalog(order.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();const result=await handoffAuthorizedCheckout(id,{catalog,prices,rules,stock});json(res,200,{...checkoutPublic(result),pfHandoff:result.pfHandoff});}}catch(error){json(res,400,{error:error.message});}return;}
 const artworkPath=/^\/api\/admin\/checkouts\/(pay-[a-f0-9-]{36})\/artwork\/([a-f0-9-]{36})$/.exec(new URL(req.url,'http://localhost').pathname);
 if(artworkPath&&req.method==='GET'){if(!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}try{const order=await readCheckout(artworkPath[1]),asset=order.artworks?.find(item=>item.id===artworkPath[2]);if(!asset)throw Error();const data=await readFile(asset.path);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${asset.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}).end(data);}catch{json(res,404,{error:'Logofilen blev ikke fundet.'});}return;}
 if(req.url?.startsWith('/api/pf-artwork?')&&req.method==='GET'){try{const asset=await readSignedArtwork(new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':asset.mimeType,'Content-Disposition':`attachment; filename="${asset.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Robots-Tag':'noindex, nofollow'}).end(asset.data);}catch{json(res,404,{error:'Trykfilen blev ikke fundet.'});}return;}
 const confirmationPath=/^\/api\/admin\/pf-confirmations\/(ord-[a-f0-9-]{36})$/.exec(legalURL.pathname);
 if(confirmationPath&&['GET','POST'].includes(req.method)){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}
  try{if(req.method==='POST'){json(res,200,await savePFConfirmation(confirmationPath[1],await readJSON(req,15*1024*1024)));}else{const doc=await readPFConfirmation(confirmationPath[1]);if(legalURL.searchParams.get('download')==='1'){res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${doc.name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}).end(Buffer.from(doc.contentBase64,'base64'));}else json(res,200,{name:doc.name,uploadedAt:doc.uploadedAt});}}catch(error){json(res,req.method==='GET'?404:400,{error:req.method==='GET'?'Ingen PF-bekræftelse gemt.':error.message});}return;
 }
 async function presentPFOrder(order){const lines=await Promise.all((order.lines||[]).map(async line=>{try{const product=await loadPFProduct(line.productId),variant=product.variants?.find(v=>v.sku===line.sku);return {...line,productName:line.productName||product.name,color:line.color||variant?.color,size:line.size||variant?.size};}catch{return line;}}));const intake=await proofIntakeStatus(order.id),mails=await proofMailboxItems(order.id);return {...order,lines,proofIntakeProblems:[...intake.filter(row=>row.status==='blocked'||row.conflict&&row.status!=='reviewed').map(row=>row.error),...mails.filter(row=>row.status==='blocked').map(row=>row.error)]};}
 const financePath=legalURL.pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/finance$/);
 if(financePath){
  if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}
  try{const pf=await readOrder(financePath[1]);if(!pf.checkoutId)throw Error('Ordren mangler en betalingsordre.');const id=pf.checkoutId;res.setHeader('Cache-Control','no-store');
   if(req.method==='GET'){const basis=legalURL.searchParams.get('basis');if(basis){const f=(await readLedger()).orders[id],shipment=f?.shipments.find(s=>s.key===basis);if(!shipment)throw Error('Leverancen findes ikke.');res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Smerch-fakturagrundlag.pdf"','Content-Security-Policy':'sandbox'}).end(Buffer.from(await salesBasisPDF(await readCheckout(id),shipment,f)));return;}const file=legalURL.searchParams.get('document');if(file){const doc=(await readLedger()).orders[id]?.documents.find(d=>d.id===file);if(!doc)throw Error('Bilag ikke fundet.');res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Smerch-bilag.pdf"','Content-Security-Policy':'sandbox'}).end(Buffer.from(doc.pdf,'base64'));return;}await reconcileSalesShipments(id);json(res,200,await financeView(id));return;}
   if(req.method==='POST'){if(!adminRequestOriginAllowed(req))throw Error('Ugyldig oprindelse.');const input=await readJSON(req,15*1024*1024);
    if(input.action==='payment')json(res,200,await executeSalesPayment(id,input));
    else if(input.action==='reconcile')json(res,200,await reconcileSalesPayment(id));
    else if(input.action==='accountant'){const row=await queueAccountantBasis(id,input.shipmentKey);json(res,200,await sendFinanceMail(id,row.key));}
    else if(input.action==='receipt')json(res,200,await sendFinanceMail(id,input.key,{confirmedNotSent:input.confirmedNotSent===true}));
    else json(res,200,await updateFinance(id,input));return;
   }json(res,405,{error:'Handlingen er ikke tilladt.'});
  }catch(e){json(res,400,{error:e.message});}return;
 }
 const adminPath=req.url?.startsWith('/api/pf-orders');
 if(adminPath){
  if(!authorized(req,process.env.PF_ORDER_ADMIN_TOKEN)&&!adminSessionAuthorized(req)){json(res,401,{error:'Administratoradgang kræves.'});return;}
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   const intakeReview=/^\/api\/pf-orders\/proof-intake\/([a-f0-9]{64})\/review$/.exec(pathname);
   if(intakeReview&&req.method==='POST'){if(!adminSessionAuthorized(req)||!adminRequestOriginAllowed(req))throw Error('Medarbejderlogin og gyldig oprindelse kræves.');json(res,200,await reviewProofIntake(intakeReview[1],await readJSON(req,8192)));return;}
   if(pathname==='/api/pf-orders/proof-mailbox/connect'&&req.method==='POST'){if(!adminSessionAuthorized(req)||!adminRequestOriginAllowed(req))throw Error('Medarbejderlogin og gyldig oprindelse kræves.');const result=await connectProofMailbox();await saveAutomationSettings({...await automationSettings(),proofMailboxEnabled:true,proofPublication:'review'});json(res,200,result);return;}
   const mailboxReview=/^\/api\/pf-orders\/proof-mailbox\/([a-f0-9]{64})\/review$/.exec(pathname);
   if(mailboxReview&&req.method==='POST'){if(!adminSessionAuthorized(req)||!adminRequestOriginAllowed(req))throw Error('Medarbejderlogin og gyldig oprindelse kræves.');json(res,200,await reviewMailboxItem(mailboxReview[1],await readJSON(req,8192)));return;}
   if(pathname==='/api/pf-orders/automation-settings'){
    if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}
    if(req.method==='GET'){json(res,200,{settings:await automationSettings(),shipments:await shipmentMailStatus(),intake:await proofIntakeStatus(),mailbox:await proofMailboxStatus()});return;}
    if(req.method==='POST'){if(!adminRequestOriginAllowed(req))throw Error('Ugyldig oprindelse.');json(res,200,await saveAutomationSettings(await readJSON(req,4096)));return;}
   }
   const automation=pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/automation$/);
   if(automation){if(!adminSessionAuthorized(req))throw Error('Medarbejderlogin kræves.');const order=await readOrder(automation[1]);await reconcileShipmentMail(order);
    if(req.method==='GET'){json(res,200,{shipments:await shipmentMailStatus(order.id),proofs:await proofMailStatus(order.id),intake:[...await proofIntakeStatus(order.id),...await proofMailboxItems(order.id)],confirmation:order.checkoutId?await orderConfirmationStatus(order.checkoutId):null});return;}
    if(req.method==='POST'){if(!adminRequestOriginAllowed(req))throw Error('Ugyldig oprindelse.');const input=await readJSON(req,4096);if(input.kind==='confirmation'){if(!order.checkoutId)throw Error('Ordren mangler checkout.');await releaseOrderConfirmation(order.checkoutId,{confirmedNotSent:input.confirmUncertain===true,initiatedBy:adminSessionActor(req)});retryOrderConfirmations().catch(()=>{});json(res,200,{queued:true});return;}if(input.kind==='proof'){await retryProofMailRecord(order.id,input.key,{confirmedNotSent:input.confirmUncertain===true,initiatedBy:adminSessionActor(req)});retryProofMail().catch(()=>{});json(res,200,{queued:true});return;}json(res,200,await sendShipmentMail(order.id,input.id,{confirmUncertain:input.confirmUncertain===true,initiatedBy:adminSessionActor(req)}));return;}
   }
   const documents=pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/documents(?:\/([a-f0-9-]{36}))?$/);
   if(documents){
    if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}
    res.setHeader('Cache-Control','private, no-store');
    const order=await presentPFOrder(await readOrder(documents[1])),checkout=order.checkoutId?await readCheckout(order.checkoutId):null,company=await companySettings();
    if(req.method==='GET'&&documents[2]){const record=await readOrderDocument(order.id,documents[2]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="Smerch-${record.document.type}-${record.id}.pdf"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}).end(Buffer.from(record.pdf,'base64'));return;}
    if(req.method==='GET'){const snapshot=legalURL.searchParams.get('snapshot');if(snapshot){const record=await readOrderDocument(order.id,snapshot);json(res,200,record.document);return;}const edit=legalURL.searchParams.get('edit');if(edit){const record=await readOrderDocument(order.id,edit),seed=documentSeed(order,checkout,company,record.document.type,record.document.shipmentKey);json(res,200,{...record.document,fingerprint:seed.fingerprint,paidAt:seed.paidAt,paymentStatus:seed.paymentStatus});return;}const type=legalURL.searchParams.get('type');json(res,200,type?documentSeed(order,checkout,company,type,legalURL.searchParams.get('delivery')):{company,documents:await listOrderDocuments(order.id),options:['confirmation','basis','shipment','receipt'].map(type=>({type,reason:documentEligibility(order,checkout,type)}))});return;}
    if(req.method==='POST'&&!documents[2]){if(!adminRequestOriginAllowed(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}const input=await readJSON(req,128*1024);if(input.action==='send'){json(res,200,await sendOrderDocument(order,input,{initiatedBy:adminSessionActor(req)}));return;}if(input.action==='settings'){json(res,200,await saveCompanySettings(input.company));return;}if(input.action==='review'){json(res,200,reviewDocument(order,checkout,company,input.document));return;}if(input.action==='generate'){json(res,201,await createOrderDocument(order,checkout,company,input.document));return;}throw Error('Ukendt dokumenthandling.');}
    json(res,405,{error:'Handlingen er ikke tilladt.'});return;
   }
   const resend=pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/resend(?:\/([a-f0-9-]{36})\/attachment\/(\d+))?$/);
   if(resend){if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}res.setHeader('Cache-Control','no-store');const order=await readOrder(resend[1]),checkout=order.checkoutId?await readCheckout(order.checkoutId):null;
    if(req.method==='GET'&&resend[2]){const draft=await readResendDraft(order.id,resend[2]),a=draft.attachments[Number(resend[3])];if(!a)throw Error('Bilaget findes ikke.');res.writeHead(200,{'Content-Type':a.contentType,'Content-Disposition':`attachment; filename="${a.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Content-Security-Policy':'sandbox','X-Content-Type-Options':'nosniff'}).end(a.base64?Buffer.from(a.base64,'base64'):a.content);return;}
    if(req.method==='GET'){json(res,200,await resendOptions(order,checkout));return;}
    if(req.method==='POST'&&!resend[2]){if(!adminRequestOriginAllowed(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}const input=await readJSON(req,4096);json(res,200,input.draftId?await sendResend(order,checkout,input.draftId,{initiatedBy:adminSessionActor(req)}):await prepareResend(order,checkout,input.action));return;}json(res,405,{error:'Handlingen er ikke tilladt.'});return;}
   const correspondence=pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/correspondence$/);
   if(correspondence){if(!adminSessionAuthorized(req)){json(res,401,{error:'Medarbejderlogin kræves.'});return;}const order=await readOrder(correspondence[1]);if(req.method==='GET'){json(res,200,await readCorrespondence(order.id));return;}if(req.method==='POST'){if(!adminRequestOriginAllowed(req)){json(res,403,{error:'Ugyldig oprindelse.'});return;}json(res,200,await addCorrespondence(order,await readJSON(req,16384),{initiatedBy:adminSessionActor(req)}));return;}json(res,405,{error:'Handlingen er ikke tilladt.'});return;}
   const testMockup=pathname.match(/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})\/mockup\/(\d+)\/(\d+)$/);
   if(testMockup&&req.method==='GET'){const [,id,line,decoration]=testMockup;const bytes=await readTestOrderMockup(await readOrder(id),Number(line),Number(decoration));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).end(bytes);return;}
   if(pathname==='/api/pf-orders/status'&&req.method==='GET'){json(res,200,{...gatewayRequirements(),automaticHandoff:handoffConfiguration(),captureEnabled:process.env.PAYMENT_PROVIDER==='quickpay'?process.env.QUICKPAY_CAPTURE_ENABLED==='1':process.env.STRIPE_CAPTURE_ENABLED==='1'});return;}
   if(pathname==='/api/pf-orders/test-cart'&&req.method==='POST'){
    if(!adminSessionAuthorized(req))throw Error('Medarbejderlogin kræves.');
    const env=pfTestEnvironment(),input=await readJSON(req,30*1024*1024);validateCartTest(input,env);
    const catalog=await loadProductCatalog(input.lines.map(line=>line.productId)),{prices,rules}=await loadPricing(),stock=await loadStock();
    const sent=await sendCartTest(input,{catalog,prices,rules,stock,env});
    json(res,201,{id:sent.id,purchaseOrderNumber:sent.purchaseOrderNumber,status:sent.status,test:true,paymentCreated:false});return;
   }
   if(pathname==='/api/pf-orders/test'&&req.method==='POST'){
    const input=await readJSON(req);
    const catalog=await loadProductCatalog(['pf-38687']),{prices,rules}=await loadPricing(),stock=await loadStock();
    const env=pfTestEnvironment();
    const order=await prepareOrder(gatewayTestOrderInput(input,{env}),{catalog,prices,rules,stock,env});
    const sent=await dispatchOrder(order.id,{env});
    json(res,201,{id:sent.id,purchaseOrderNumber:sent.purchaseOrderNumber,status:sent.status,gatewayResponse:sent.gatewayResponse,test:true,paymentCreated:false});return;
   }
   if(pathname==='/api/pf-orders'&&req.method==='GET'){json(res,200,await Promise.all((await listOrders()).map(async ({gatewayPayload,lines,supplierTotal,...order})=>presentPFOrder({...order,isTest:gatewayPayload?.Header?.isTest===true,lines:lines.map(({supplierUnitPrice,...line})=>line)}))));return;}
   if(pathname==='/api/pf-orders'&&req.method==='POST'){const input=await readJSON(req,2*1024*1024);if(input.checkoutId)throw Error('Kundeordrer oprettes kun gennem det interne betalingsflow.');const catalog=await loadProductCatalog(input.lines?.map(line=>line.productId)||[]),{prices,rules}=await loadPricing(),stock=await loadStock(),order=await prepareOrder(input,{catalog,prices,rules,stock});json(res,201,{id:order.id,status:order.status,quote:order.quote});return;}
   const match=/^\/api\/pf-orders\/(ord-[a-f0-9-]{36})(?:\/(send|proof|proof-file|decision|approval-delivery|external-approval|publish|mail-status|feedback-file))?$/.exec(pathname);
   if(match){const [,id,action]=match;if(action==='publish'&&req.method==='POST'){if(!adminSessionAuthorized(req))throw Error('Medarbejderlogin kræves.');const input=await readJSON(req,8192);const result=await publishCustomerProof(id,{version:input.version,message:input.message,initiatedBy:adminSessionActor(req)});retryProofMail().catch(()=>{});json(res,200,result);return;}if(action==='mail-status'&&req.method==='GET'){json(res,200,await proofMailStatus(id));return;}if(action==='feedback-file'&&req.method==='GET'){const attachment=await readFeedbackFile(id,new URL(req.url,'http://localhost').searchParams.get('hash'));res.writeHead(200,{'Content-Type':attachment.mimeType,'Content-Disposition':'attachment','Content-Security-Policy':'sandbox'}).end(attachment.data);return;}if(req.method==='GET'&&!action){json(res,200,await presentPFOrder(await readOrder(id)));return;}if(req.method==='GET'&&action==='proof-file'){const version=new URL(req.url,'http://localhost').searchParams.get('version'),proof=await readProofFile(id,version);res.writeHead(200,{'Content-Type':proof.mimeType,'Content-Disposition':'inline','Content-Security-Policy':'sandbox','X-Frame-Options':'SAMEORIGIN'}).end(proof.data);return;}if(req.method==='POST'&&action==='send'){const order=await dispatchOrder(id,{initiatedBy:adminSessionActor(req)});json(res,200,{id:order.id,status:order.status,gatewayResponse:order.gatewayResponse});return;}if(req.method==='POST'&&action==='proof'){const order=await recordProof(id,{...await readJSON(req,15*1024*1024),source:"admin",performedBy:adminSessionActor(req)});json(res,200,{id:order.id,status:order.status,proof:order.proof});return;}if(req.method==='POST'&&action==='decision'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må godkende kundeordrer.');const input=await readJSON(req);const order=await decideProof(id,{version:input.version,decision:input.decision,comment:input.comment,performedBy:adminSessionActor(req)});json(res,200,{id:order.id,status:order.status,decision:order.decision});return;}if(req.method==='POST'&&action==='approval-delivery'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må registrere godkendelse til PF.');const order=await recordApprovalDelivery(id,{...await readJSON(req),performedBy:adminSessionActor(req)});json(res,200,{id:order.id,status:order.status,decision:order.decision});return;}if(req.method==='POST'&&action==='external-approval'){const current=await readOrder(id);if(current.checkoutId&&!adminSessionAuthorized(req))throw Error('Kun medarbejderlogin må frigive kundeordrer.');const order=await recordExternalApproval(id,{...await readJSON(req),performedBy:adminSessionActor(req)});json(res,200,{id:order.id,status:order.status,proof:order.proof});return;}}
   json(res,404,{error:'Ordrehandlingen findes ikke.'});
  }catch(error){json(res,400,{error:error.message||'Ordren kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/pf-proof-inbox'&&req.method==='POST'){
  if(!proofInboxAuthorized(req)){json(res,401,{error:'Adgang til korrekturindbakken kræves.'});return;}
  try{const result=await receiveProof(await readPFRelayJSON(req,15*1024*1024));if(result.status==='published')retryProofMail().catch(()=>{});json(res,200,{received:true,...result});}catch(error){json(res,400,{error:error.message||'Korrekturen kunne ikke modtages.'});}return;
 }
 if(req.url?.startsWith('/api/pf-callback/')&&req.method==='POST'){
  if(!callbackAuthorized(req)){json(res,401,{error:'PF-adgang kræves.'});return;}
  try{const kind=new URL(req.url,'http://localhost').pathname.split('/').at(-1),orders=await applyPFNotificationBatch(kind,await readPFCallback(req,kind));for(const order of orders){await reconcileShipmentMail(order);if(order.checkoutId&&order.shipment)await updateCheckout(order.checkoutId,checkout=>{checkout.shipment={...(checkout.shipment||{}),[order.id]:order.shipment};return checkout;});}json(res,200,{received:true,orderId:orders[0]?.id,orderIds:orders.map(order=>order.id)});}catch(error){json(res,400,{error:error.message||'PF-beskeden kunne ikke behandles.'});}return;
 }
 if(req.url==='/api/ai-status'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:process.env.AI_ENABLED==='1'&&Boolean(process.env.OPENAI_API_KEY)}));return;}
 if(req.url?.startsWith('/api/pf-documents?')&&req.method==='GET'){
  try{const query=new URL(req.url,'http://localhost').searchParams,product=await loadPFProduct(query.get('productId')||''),id=query.get('document');
   if(id){const file=await downloadProductDocument(product,id);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${file.filename}"`,'X-Content-Type-Options':'nosniff'}).end(file.data);}
   else{const documents=await listProductDocuments(product);json(res,200,{documents:documents.map(({id,label,kind})=>({id,label,kind,url:`/api/pf-documents?productId=${encodeURIComponent(product.id)}&document=${encodeURIComponent(id)}`}))});}
  }catch{json(res,404,{error:'Dokumenterne kunne ikke hentes. Prøv igen senere.'});}return;
 }
 if(req.url==='/api/pf-product-prices'&&req.method==='GET'){
  try{const catalog=await loadCatalogIndex();const {prices,rules}=await loadPricing(),result=listPFProductPrices(catalog,prices,rules);result.quoteOnlyIds=await quoteOnlyProductIds(catalog,result);result.comingSoonIds=result.available?catalog.products.filter(product=>product.brandId==='citizen-green'&&!result.products[product.id]&&product.variants.some(variant=>!variant.discontinued)).map(product=>product.id):[];await sendPublicJSON(req,res,result);}catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({available:false,message:'Priserne kunne ikke indlæses.',products:{},skus:{},quoteOnlyIds:[],comingSoonIds:[]}));}return;
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
 if(req.url?.startsWith('/api/pf-imprint-image?')&&req.method==='GET'){
  try{
   const source=new URL(req.url,'http://localhost').searchParams.get('src'),url=new URL(source);
   if(url.protocol!=='https:'||url.hostname!=='images.pfconcept.com'||!/^\/ImprintImages_All\/JPG\/500x500\/[A-Za-z0-9_-]+\.jpe?g$/i.test(url.pathname))throw Error();
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok||Number(response.headers.get('content-length')||0)>8*1024*1024)throw Error();
   const image=Buffer.from(await response.arrayBuffer());
   if(image.length>8*1024*1024||image[0]!==255||image[1]!==216||image[2]!==255)throw Error();
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}).end(image);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Placeringsbilledet kunne ikke indlæses.');}return;
 }
 if(req.url?.startsWith('/api/pf-placement?')&&req.method==='GET'){
  try{
   const source=new URL(req.url,'http://localhost').searchParams.get('src'),url=new URL(source);
   if(url.protocol!=='https:'||url.hostname!=='imagedata.pfconcept.com'||!url.pathname.startsWith('/2d/models/')||!url.pathname.endsWith('.svg'))throw Error();
   let bounds=placementCache.get(url.href);
   if(!bounds){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const length=Number(response.headers.get('content-length')||0);if(length>8*1024*1024)throw Error();const svg=await response.text();if(svg.length>8*1024*1024)throw Error();bounds=parsePFPlacementSVG(svg);placementCache.set(url.href,bounds);while(placementCache.size>500)placementCache.delete(placementCache.keys().next().value);}
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(bounds));
  }catch{res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'Trykfladen kunne ikke aflæses.'}));}return;
 }
 if(req.url?.startsWith('/api/pf-placement-art?')&&req.method==='GET'){
  try{
   const source=new URL(req.url,'http://localhost').searchParams.get('src'),url=new URL(source);
   if(url.protocol!=='https:'||url.hostname!=='imagedata.pfconcept.com'||!url.pathname.startsWith('/2d/models/')||!url.pathname.endsWith('.svg'))throw Error();
   const guide=new URL(req.url,'http://localhost').searchParams.get('guide')==='1',cacheKey=url.href+(guide?'#guide':'');
   let svg=placementArtCache.get(cacheKey);
   if(!svg){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();svg=await response.text();if(svg.length>8*1024*1024)throw Error();svg=guide?highlightPFPlacementGuide(svg):stripPFPlacementGuide(svg);placementArtCache.set(cacheKey,svg);while(placementArtCache.size>200)placementArtCache.delete(placementArtCache.keys().next().value);}
   res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8'}).end(svg);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Placeringsbilledet kunne ikke indlæses.');}return;
 }
 if(req.url==='/api/pf-estimate'&&req.method==='POST'){
  if(req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error();chunks.push(chunk);}const line=JSON.parse(Buffer.concat(chunks).toString());const catalog=await loadProductCatalog([line.productId]);const {prices,rules}=await loadPricing();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(estimatePFLine(catalog,line,prices,rules)));}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Prisen kunne ikke beregnes.'}));}return;
 }
 if(req.url==='/api/pf-quote'&&req.method==='POST'){
  if(req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error();chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString());if(!Array.isArray(body.lines)||body.lines.length>100)throw Error();const resolved=await resolveCompanyCart(body.lines,await companySession(req),{loadCatalog:loadProductCatalog});body.lines=resolved.lines;const catalog=await loadProductCatalog(body.lines.map(line=>line.productId));const {prices,rules}=await loadPricing();res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(quotePFCart(catalog,body.lines,prices,rules)));}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Kurven kunne ikke prisberegnes.'}));}return;
 }
 if(req.url==='/api/design-check'&&req.method==='POST'){
  let sameOrigin=false;
  try{const origin=new URL(req.headers.origin);sameOrigin=['https:','http:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{}
  if(!sameOrigin){json(res,403,{error:'Designet kunne ikke kontrolleres. Genindlæs siden, og prøv igen.'});return;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:'Designet skal sendes som JSON.'});return;}
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
 if(path==='/pf-english.json'){const data=await readFile(resolve(root,'pf-english.json'));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache'}).end(req.method==='HEAD'?undefined:data);return;}
 if(path==='/api/pf-catalog'){await sendPublicJSON(req,res,publicAssortment(await loadCatalogIndex(),await readAssortment()));return;}
 if(/^\/api\/pf-product\/pf-[a-z0-9]+$/i.test(path)){const product=await loadPFProduct(path.split('/').at(-1));if(!product||!isVisibleProduct(product,await readAssortment())){res.writeHead(404).end('Produktet findes ikke');return;}await sendPublicJSON(req,res,product);return;}
 if(path==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(publicCatalog()));return;}
 if(path==='/robots.txt'){const data=Buffer.from(robotsTXT);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600','Content-Length':data.length}).end(req.method==='HEAD'?undefined:data);return;}
 if(path==='/sitemap.xml'){const catalog=publicAssortment(await loadCatalogIndex(),await readAssortment()),{prices,rules}=await loadPricing(),priceData=listPFProductPrices(catalog,prices,rules);if(!priceData.available){res.writeHead(503,{'Retry-After':'300'}).end('Sitemap midlertidigt utilgængeligt');return;}const data=Buffer.from(sitemapXML(catalog,priceData));res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600','Content-Length':data.length}).end(req.method==='HEAD'?undefined:data);return;}
 const isPage=/^\/design\/pf-[a-z0-9]+$/i.test(path)||path==='/'||path==='/produkter'||path==='/brands'||path==='/specialproduktion'||path==='/demokurv'||path==='/kurv'||path==='/betaling'||path==='/ordre'||path==='/kontakt'||path==='/om-smerch'||path==='/gennemgang'||/^\/produkt\/[a-z0-9-]+$/.test(path);
 if(path==='/korrektur'){res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');}
 if(path==='/virksomhed'){res.setHeader('X-Robots-Tag','noindex, nofollow');}
 const file=path==='/virksomhed'?resolve(root,'company.html'):path==='/korrektur'?resolve(root,'customer-proof.html'):path==='/admin'?resolve(root,'admin-dashboard.html'):path==='/admin/pf-orders'?resolve(root,'pf-orders-admin.html'):isPage?resolve(root,'index.html'):resolve(root,'.'+path);
 if(!file.startsWith(root+sep)||!types[extname(file)]){res.writeHead(404).end('Siden findes ikke');return;}
 if(isPage){
  const catalog=publicAssortment(await loadCatalogIndex(),await readAssortment()),visible=/^\/design\/pf-/i.test(path)?catalog.products.find(product=>product.id===path.split('/').at(-1)):null;
  if(/^\/design\/pf-/i.test(path)&&!visible){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex'}).end(req.method==='HEAD'?undefined:'Produktet findes ikke');return;}
  const detail=visible?await loadPFProduct(visible.id):null,checkout=visible?checkoutConfiguration():null;
  const commerce=launchConfig.ordersEnabled&&visible&&checkout.ready&&checkout.mode==='live'?await (async()=>{const {prices,rules}=await loadPricing();return {prices:listPFProductPrices(catalog,prices,rules),stock:listPFStock(catalog,await loadStock()),checkout};})():null;
  const page=seoPage(path,legalURL.search,catalog,detail,commerce);
  const template=await readFile(file,'utf8');
  const html=template.replace('<title>Smerch</title>',`<title>${page.title.replaceAll('&','&amp;').replaceAll('<','&lt;')}</title>${seoHead(page)}${path==='/'?'<link rel="preload" as="image" href="/assets/smerch-orange-tote-lifestyle-960.jpg" imagesrcset="/assets/smerch-orange-tote-lifestyle-640.jpg 640w, /assets/smerch-orange-tote-lifestyle-960.jpg 960w, /assets/smerch-orange-tote-lifestyle-1280.jpg 1280w, /assets/smerch-orange-tote-lifestyle.jpg 1536w" imagesizes="100vw" fetchpriority="high">':''}`).replace('<main id="main" tabindex="-1" data-loading><div class="wrap loading">Indlæser produkter…</div></main>',`<main id="main" tabindex="-1" data-loading>${seoMain(page,catalog)}</main>`);
  const data=Buffer.from(html);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','Content-Length':data.length}).end(req.method==='HEAD'?undefined:data);return;
 }
 const data=await readFile(file),extension=extname(file),cacheControl=['.html','.css','.mjs','.js'].includes(extension)?'no-cache':'public, max-age=604800, stale-while-revalidate=86400';
 res.writeHead(200,{'Content-Type':types[extension],'Cache-Control':cacheControl,'Content-Length':data.length}).end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404).end('Siden findes ikke');}
};
async function freightContext(input,req){
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>20)throw Error('Kurven skal indeholde 1–20 varer.');
 const resolved=await resolveCompanyCart(input.lines,await companySession(req),{loadCatalog:loadProductCatalog}),catalog=await loadProductCatalog(resolved.lines.map(line=>line.productId)),lines=resolved.lines.map(line=>sanitizeDesignLine(catalog,line)),shipping=validateDelivery(input.shipping),config=checkoutConfiguration(),fulfillment=checkoutFulfillmentAssessment(catalog,lines,config.freightByLocation,{...config,freightQuoteRequired:true});
 if(!fulfillment.ready)throw Error(fulfillment.message);const {prices,rules}=await loadPricing(),quote=quotePFCart(catalog,lines,prices,rules);if(!Number.isSafeInteger(quote.totalIncVat)||quote.totalIncVat<=0)throw Error('Vareprisen skal afklares før fragt.');
 return {lines,shipping,deliveryMethod:input.deliveryMethod||'STD',goodsTotalIncVat:quote.totalIncVat,groups:fulfillment.groups};
}
const server=createServer(handleRequest);
server.on('error',e=>{console.error(e.message);process.exit(1)});
setInterval(()=>{processProofMailbox().catch(()=>{});processSalesFinance().catch(()=>{});retryWithdrawalReceipts().catch(()=>{});retryOrderConfirmations().catch(()=>{});retryProofMail().catch(()=>{});processShipmentMail().catch(()=>{});syncEconomicInvoices().catch(()=>{});},60000).unref();
server.listen(port,host,()=>console.log(`Smerch server listening on ${host}:${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
const syncMinutes=Number(process.env.PF_PRICE_SYNC_INTERVAL_MINUTES||60);
const hasPriceFeeds=Boolean((process.env.PF_PRICE_FEED_URL||process.env.PF_PRICE_FILE)&&(process.env.PF_PRINT_PRICE_FEED_URL||process.env.PF_PRINT_PRICE_FILE));
if(hasPriceFeeds&&Number.isFinite(syncMinutes)&&syncMinutes>=15){
 let syncing=false;
 const sync=()=>{if(syncing)return;syncing=true;const child=spawn(process.execPath,[fileURLToPath(new URL('./scripts/sync-pf-prices.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:['ignore','inherit','inherit']});child.on('error',()=>{syncing=false;console.error('PF-feedsynkronisering kunne ikke startes. Tidligere priser er bevaret.');});child.on('exit',code=>{syncing=false;if(code!==0)console.error('En eller flere PF-feedopdateringer mislykkedes. Se feedstatus ovenfor.');});};
 setTimeout(sync,5_000).unref();
 setInterval(sync,syncMinutes*60_000).unref();
}

startPopularitySync();

