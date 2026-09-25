// PF Concept Gateway v2.2.2. Keep this module server-side: credentials and
// supplier prices must never be sent to the storefront.
const TEST_URL='https://wsa.pfconcept.com/test/RestGateway/rest/RestGatewayService/order';
const LIVE_URL='https://wsa.pfconcept.com/RestGateway/rest/RestGatewayService/order';
const required=(value,label)=>{if(typeof value!=='string'||!value.trim())throw Error(`${label} mangler.`);return value.trim();};
const positive=(value,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error(`${label} er ugyldig.`);return n;};
const cents=value=>Math.round(positive(value,'PF-pris')*100)/100;
const url=value=>{const parsed=new URL(required(value,'Trykfilens URL'));if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Trykfilen kræver en offentlig HTTPS-URL.');return parsed.href;};
const gatewayPassword=(env,mode)=>mode==='live'?(env.PF_GATEWAY_PROD_PASSWORD||env.PF_GATEWAY_PASSWORD):(env.PF_GATEWAY_TEST_PASSWORD||env.PF_GATEWAY_PASSWORD);

export function gatewayConfiguration(env=process.env){
 const mode=env.PF_GATEWAY_MODE||'off';
 if(!['off','test','live'].includes(mode))throw Error('PF_GATEWAY_MODE skal være off, test eller live.');
 if(mode==='live'&&env.PF_GATEWAY_LIVE_ENABLED!=='1')throw Error('Liveordrer er ikke aktiveret.');
 if(mode==='off')return {mode,ready:false};
 return {mode,ready:Boolean(env.PF_GATEWAY_USERNAME&&gatewayPassword(env,mode)&&env.PF_GATEWAY_SENDER_ID&&env.PF_COMMUNICATION_EMAIL),endpoint:mode==='test'?TEST_URL:LIVE_URL};
}
export function gatewayRequirements(env=process.env){
 const mode=env.PF_GATEWAY_MODE||'off';
 const fields=[['PF_GATEWAY_USERNAME','PF Gateway-brugernavn fra Technical Support'],['PF_GATEWAY_SENDER_ID','Sender ID konfigureret og bekræftet af PF'],['PF_COMMUNICATION_EMAIL','PF Store-adresse til korrektur']];
 const missing=fields.filter(([key])=>!String(env[key]||'').trim()).map(([,label])=>label);
 if(!String(gatewayPassword(env,mode)||'').trim())missing.splice(1,0,mode==='live'?'PF Gateway-produktionsadgangskode':'PF Gateway-testadgangskode');
 if(mode==='off')return {mode,ready:false,missing,nextStep:'Vælg testtilstand, når PF har udstedt Gateway-testadgang.'};
 const config=gatewayConfiguration(env);
 return {...config,missing,nextStep:config.ready?'Testforbindelsen er konfigureret. Afprøv en kontrolleret testordre før liveaktivering.':'PF-oplysningerne skal tilføjes på serveren.'};
}

export function buildPFOrder(order,{senderId,communicationEmail,isTest=true}={}){
 if(!order||!Array.isArray(order.lines)||!order.lines.length||order.lines.length>100)throw Error('Ordren skal have varelinjer.');
 const ship=order.shipping||{},address=ship.address||{};
 const contact={Name:required(ship.company||ship.name,'Leveringsnavn'),Attention:required(ship.name,'Kontaktperson'),Email:required(ship.email,'E-mail'),Phone:required(ship.phone,'Telefon'),shipAddress:{Address1:required(address.street,'Adresse'),City:required(address.city,'By'),PostalCode:required(address.postalCode,'Postnummer'),Country:required(address.country,'Landekode').toUpperCase()}};
 if(!/^[A-Z]{2}$/.test(contact.shipAddress.Country))throw Error('Landekoden skal være ISO-2.');
 if(address.street2)contact.shipAddress.Address2=String(address.street2).slice(0,100);
 const skus=[],decorations=[],artworks=[];
 for(const [lineIndex,line] of order.lines.entries()){
  const item={skuReferenceID:String(lineIndex),isItemProof:false,SKUID:required(line.sku,'PF-SKU'),UnitPrice:cents(line.supplierUnitPrice),Quantity:positive(line.quantity,'Antal')};
  if(!Number.isInteger(item.Quantity))throw Error('Antal skal være et helt tal.');
  if(line.decorations?.length){item.Eproof='EPROOF';item.DecorationReferenceIDs=[];}
  for(const design of line.decorations||[]){
   const ref=String(decorations.length),codes=design.pmsColors;
   if(!Array.isArray(codes)||codes.length!==Number(design.colors)||codes.some(code=>typeof code!=='string'||!code.trim()))throw Error('PF-trykfarver skal være afklaret for hver placering.');
   const files=design.files||{},rawFiles=Array.isArray(files.raw)?files.raw:[files.raw];
   if(!rawFiles.length||rawFiles.some(source=>!source))throw Error('Produktionsklare RAW-filer mangler.');
   const fileRefs=[];
   for(const [kind,source] of [...rawFiles.map(source=>['RAW',source]),...(files.proof?[['PROOF',files.proof]]:[])]){
    const reference=String(artworks.length),fileUrl=url(source);
    artworks.push({artworkReferenceID:reference,ArtworkFileName:'',UrlArtFile:fileUrl,ArtworkType:kind});fileRefs.push(reference);
   }
   decorations.push({decorationReferenceID:ref,allowArtSizeToMax:false,ConfigurationID:`${required(design.methodCode==null?'':String(design.methodCode),'Trykmetode')}-${required(design.positionCode==null?'':String(design.positionCode),'Placering')}`,NumberOfColors:Number(design.colors),PMSColors:codes.map(code=>code.trim()),ArtworkReferenceIDs:fileRefs,ArtWidth:positive(design.width,'Trykbredde'),ArtHeight:positive(design.height,'Trykhøjde'),...(design.text?{decoText:String(design.text).slice(0,200)}:{})});
   item.DecorationReferenceIDs.push(ref);
  }
  skus.push(item);
 }
 const decorated=decorations.length>0;
 if(decorated&&order.lines.some(line=>!line.decorations?.length))throw Error('Varer med og uden tryk skal sendes som separate PF-ordrer.');
 const payload={Header:{messageId:required(order.messageId,'Besked-id'),timestamp:new Date(order.createdAt).toISOString(),isTest,receiverId:'PF',senderId:required(senderId,'Sender-id')},OrderType:decorated?'DECORATED':'BLANK',PurchaseOrderNumber:required(order.purchaseOrderNumber,'Ordrenummer'),Currency:required(order.currency,'Valuta'),PurchaseOrderTotal:cents(order.supplierTotal),ProcessingPriority:'STANDARD',CommunicationEmail:required(communicationEmail,'PF-korrekturadresse'),Shipments:[{shipmentReferenceID:'0',Service:'STD',shipContact:contact}],SKUs:skus};
 if(decorated){payload.Decorations=decorations;payload.Artworks=artworks;}
 return payload;
}

export async function submitPFOrder(payload,{env=process.env,fetchImpl=fetch}={}){
 const config=gatewayConfiguration(env);
 if(!config.ready)throw Error('PF Gateway er ikke konfigureret.');
 if(Boolean(payload.Header?.isTest)!==(config.mode==='test'))throw Error('Testflag og PF-miljø stemmer ikke overens.');
 const response=await fetchImpl(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Basic ${Buffer.from(`${env.PF_GATEWAY_USERNAME}:${gatewayPassword(env,config.mode)}`).toString('base64')}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{throw Error(`PF Gateway svarede ugyldigt (${response.status}).`);}
 if(!response.ok||data.status!=='success'||data.yourMessageId!==payload.Header.messageId)throw Error(`PF Gateway afviste ordren (${response.status}): ${String(data.message||data.status||'ukendt fejl').slice(0,300)}`);
 return {httpStatus:response.status,message:data.message||'Modtaget af PF Gateway',yourMessageId:data.yourMessageId};
}
