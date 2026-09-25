const present=value=>typeof value==='string'&&value.trim().length>0;
const secret=value=>present(value)&&value.trim().length>=32;
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

function https(value){
 try{return new URL(value).protocol==='https:';}catch{return false;}
}

function validColourMap(value){
 try{
  const parsed=JSON.parse(value||'{}');
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).length>0&&Object.entries(parsed).every(([hex,pms])=>/^#[0-9a-f]{6}$/i.test(hex)&&present(pms));
 }catch{return false;}
}

export function pfReadiness(env=process.env){
 const mode=env.PF_GATEWAY_MODE||'off';
 const gatewayPassword=mode==='live'?(env.PF_GATEWAY_PROD_PASSWORD||env.PF_GATEWAY_PASSWORD):(env.PF_GATEWAY_TEST_PASSWORD||env.PF_GATEWAY_PASSWORD);
 const checks=[
  {id:'feeds',label:'Pris-, trykpris- og lagerfeeds',ready:[env.PF_PRICE_FEED_URL||env.PF_PRICE_FILE,env.PF_PRINT_PRICE_FEED_URL||env.PF_PRINT_PRICE_FILE,env.PF_STOCK_FEED_URL||env.PF_STOCK_FILE].every(present),source:'PF'},
  {id:'gateway_mode',label:'PF Gateway står i testtilstand',ready:mode==='test',source:'PF'},
  {id:'gateway_username',label:'Gateway test-brugernavn fra PF Technical Support',ready:present(env.PF_GATEWAY_USERNAME),source:'PF'},
  {id:'gateway_password',label:mode==='live'?'Gateway produktionsadgangskode fra PF Technical Support':'Gateway test-adgangskode fra PF Technical Support',ready:present(gatewayPassword),source:'PF'},
  {id:'sender_id',label:'Sender ID konfigureret og bekræftet af PF',ready:present(env.PF_GATEWAY_SENDER_ID),source:'PF'},
  {id:'communication_email',label:'PF CommunicationEmail til e-proof',ready:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.PF_COMMUNICATION_EMAIL||''),source:'PF'},
  {id:'public_url',label:'Offentlig HTTPS-adresse',ready:https(env.SMERCH_PUBLIC_BASE_URL),source:'Smerch'},
  {id:'artwork_signing',label:'Signering af tidsbegrænsede trykfillinks',ready:secret(env.SMERCH_ARTWORK_SIGNING_SECRET),source:'Smerch'},
  {id:'proof_inbox',label:'Beskyttet korrekturindbakke',ready:secret(env.PF_PROOF_INBOX_TOKEN),source:'Smerch'},
  {id:'callback_auth',label:'Basic Auth til PF-callbacks',ready:present(env.PF_CALLBACK_USERNAME)&&secret(env.PF_CALLBACK_PASSWORD),source:'Smerch/PF'},
  {id:'relay_signing',label:'Signatur mellem PF-relæ og Smerch',ready:secret(env.PF_WEBHOOK_SIGNING_SECRET),source:'Smerch'},
  {id:'freight_pl',label:'Verificeret fragt fra Polen',ready:positive(env.SMERCH_FREIGHT_PL_EX_VAT_DKK),source:'PF'},
  {id:'freight_uk',label:'Verificeret fragt fra Storbritannien',ready:positive(env.SMERCH_FREIGHT_UK_EX_VAT_DKK),source:'PF'},
  {id:'pms_map',label:'Verificeret farvekort til PF-koder',ready:validColourMap(env.SMERCH_PMS_COLOR_MAP),source:'PF/Smerch'},
  {id:'proof_delivery',label:'PF har bekræftet e-proof-kanalen',ready:env.PF_PROOF_DELIVERY_CONFIRMED==='1',source:'PF'},
  {id:'white_label',label:'PF har bekræftet Smerch-forsendelse',ready:env.PF_WHITE_LABEL_CONFIRMED==='1',source:'PF'}
 ];
 const phases={
  gatewayTest:['feeds','gateway_mode','gateway_username','gateway_password','sender_id','communication_email'],
  endToEndTest:['feeds','gateway_mode','gateway_username','gateway_password','sender_id','communication_email','public_url','artwork_signing','proof_inbox','callback_auth','freight_pl','freight_uk','pms_map'],
  live:['feeds','gateway_username','gateway_password','sender_id','communication_email','public_url','artwork_signing','proof_inbox','callback_auth','relay_signing','freight_pl','freight_uk','pms_map','proof_delivery','white_label']
 };
 const byId=Object.fromEntries(checks.map(check=>[check.id,check]));
 const phase=name=>({ready:phases[name].every(id=>byId[id].ready),missing:phases[name].filter(id=>!byId[id].ready).map(id=>byId[id].label)});
 return {mode,checks,phases:{gatewayTest:phase('gatewayTest'),endToEndTest:phase('endToEndTest'),live:phase('live')}};
}
