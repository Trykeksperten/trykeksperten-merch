import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,rmdir} from 'node:fs/promises';
import {dataPath} from './data-path.mjs';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(value).digest('hex');
const shippingKeys=['name','company','email','phone','street','postalCode','city','country','deliveryComment'];
export function freightContextKey({lines,shipping,deliveryMethod='STD',goodsTotalIncVat,groups=[]}){return hash(JSON.stringify(stable({lines,shipping:Object.fromEntries(shippingKeys.map(key=>[key,String(shipping?.[key]||'').trim()])),deliveryMethod,goodsTotalIncVat,groups})));}
const path=id=>{if(!/^freight-[a-f0-9-]{36}$/.test(id||''))throw Error('Ugyldig fragtreference.');return dataPath('freight-quotes',id+'.json');};
const read=async id=>JSON.parse(await readFile(path(id),'utf8'));
async function save(record){await mkdir(dataPath('freight-quotes'),{recursive:true,mode:0o700});const tmp=path(record.id)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(record),{mode:0o600});await rename(tmp,path(record.id));}
async function lock(id,fn){await mkdir(dataPath('freight-quotes'),{recursive:true,mode:0o700});const p=path(id)+'.lock';try{await mkdir(p);}catch(e){if(e.code==='EEXIST')throw Error('Fragttilbuddet behandles. Prøv igen om lidt.');throw e;}try{return await fn();}finally{await rmdir(p);}}
export function freightMarkup(env=process.env){const raw=String(env.SMERCH_FREIGHT_MARKUP_EX_VAT_DKK||'0').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(raw))throw Error('Fragtens tillæg skal angives i DKK med højst to decimaler.');const amount=Math.round(Number(raw)*100);if(!Number.isSafeInteger(amount))throw Error('Fragtens tillæg er ugyldigt.');return amount;}
export async function requestFreight(context,{now=Date.now()}={}){
 if(context.deliveryMethod!=='STD')throw Error('Kun standardlevering kan tilbydes online. Andre leveringsformer kræver særskilt aftale.');
 if(!Number.isSafeInteger(context.goodsTotalIncVat)||context.goodsTotalIncVat<=0||!context.groups?.length)throw Error('Varer og forsendelser skal afklares før fragt.');
 const token=randomBytes(32).toString('hex'),record={id:'freight-'+randomUUID(),createdAt:new Date(now).toISOString(),status:'review',contextKey:freightContextKey(context),tokenHash:hash(token),lines:context.lines,shipping:context.shipping,deliveryMethod:context.deliveryMethod,goodsTotalIncVat:context.goodsTotalIncVat,groups:context.groups,revision:0,events:[]};await save(record);return {id:record.id,token,status:'review'};
}
function tokenValid(record,token){if(!/^[a-f0-9]{64}$/.test(token||'')||!timingSafeEqual(Buffer.from(record.tokenHash,'hex'),Buffer.from(hash(token),'hex')))throw Error('Fragttilbuddet findes ikke eller adgangen er ugyldig.');}
export async function freightStatus(id,token,context,{now=Date.now()}={}){
 const record=await read(id);tokenValid(record,token);if(context&&record.contextKey!==freightContextKey(context))return {id,status:'changed',message:'Kurv, adresse eller varepris er ændret. Bed om et nyt fragttilbud.'};
 if(record.checkoutId)return {id,status:'used',checkoutId:record.checkoutId};
 if(!record.quote)return {id,status:'review',message:'Fragtprisen afventer Smerchs beregning hos PF. Der er ikke oprettet en ordre.'};
 if(Date.parse(record.quote.validUntil)<=now)return {id,status:'expired',message:'Fragttilbuddet er udløbet. Bed om en ny pris.'};
 return {id,status:'quoted',revision:record.revision,validUntil:record.quote.validUntil,deliveryMethod:record.deliveryMethod,freightExVat:record.quote.customerExVat,freightIncVat:record.quote.customerIncVat,totalIncVat:record.goodsTotalIncVat+record.quote.customerIncVat};
}
export async function listFreightRequests(){try{const files=await readdir(dataPath('freight-quotes'));return (await Promise.all(files.filter(name=>/^freight-[a-f0-9-]{36}\.json$/.test(name)).map(name=>read(name.slice(0,-5))))).map(({tokenHash,...record})=>record).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function approveFreight(id,input,{actor,env=process.env,now=Date.now()}={}){return lock(id,async()=>{
 const record=await read(id);if(record.checkoutId)throw Error('Fragten er allerede accepteret på en ordre.');
 if(!actor||actor.type!=='staff')throw Error('Medarbejderidentitet kræves.');
 if(input.currency!=='DKK'||input.exVatConfirmed!==true||input.completeShipmentConfirmed!==true)throw Error('Bekræft DKK ekskl. moms og fragt for alle produkter, pakker og planlagte leverancer.');
 if(!input.evidence?.trim()||input.evidence.length>1000)throw Error('Registrér hvor PF-prisen er kontrolleret.');
 if(input.supplierValidUntil&&(!Number.isFinite(Date.parse(input.supplierValidUntil))||Date.parse(input.supplierValidUntil)<Date.parse(input.validUntil)))throw Error('Kundetilbuddet må ikke gælde længere end PF’s dokumenterede prisfrist.');
 if(!Number.isFinite(Date.parse(input.validUntil))||Date.parse(input.validUntil)<=now)throw Error('Angiv tilbuddets fremtidige udløbstidspunkt.');
 if(!Array.isArray(input.groups)||input.groups.length!==record.groups.length)throw Error('Der kræves en PF-pris for hvert produktionssted.');
 const groups=record.groups.map((group,index)=>{const value=input.groups[index];if(value.location!==group.location||!Number.isSafeInteger(value.supplierExVat)||value.supplierExVat<0||value.supplierExVat===0&&input.freeFreightConfirmed!==true)throw Error('Registrér PF’s faktiske fragtpris for hver forsendelse. Gratis fragt kræver særskilt bekræftelse.');return {...group,supplierExVat:value.supplierExVat,pfPriceReference:String(value.pfPriceReference||'').trim().slice(0,200)||null};});
 const supplierExVat=groups.reduce((sum,g)=>sum+g.supplierExVat,0),markupExVat=freightMarkup(env),customerExVat=supplierExVat+markupExVat,customerIncVat=customerExVat+Math.round(customerExVat*.25);
 if(!Number.isSafeInteger(customerIncVat)||customerIncVat>999999999)throw Error('Fragtprisen er ugyldig.');
 record.quote={source:'manual_pf',currency:'DKK',supplierExVat,markupExVat,customerExVat,customerIncVat,groups,evidence:input.evidence.trim(),validUntil:new Date(input.validUntil).toISOString(),supplierValidUntil:input.supplierValidUntil||null,quotedAt:new Date(now).toISOString(),quotedBy:actor};record.status='quoted';record.revision++;record.events.push({at:new Date(now).toISOString(),type:'freight_quoted',actor,revision:record.revision});await save(record);return {id,revision:record.revision};
});}
export async function acceptedFreight(input,context,{now=Date.now()}={}){
 if(input?.accepted!==true)throw Error('Godkend først fragt og samlet pris.');const record=await read(input.id);tokenValid(record,input.token);
 if(record.checkoutId||!record.quote||record.revision!==input.revision||Date.parse(record.quote.validUntil)<=now||record.contextKey!==freightContextKey(context))throw Error('Fragttilbuddet er ændret, udløbet eller matcher ikke kurv og leveringsadresse. Få fragten beregnet igen.');
 return {id:record.id,revision:record.revision,contextKey:record.contextKey,...record.quote};
}
export function assertFreightSnapshot(quote,context,now=Date.now()){
 if(!quote||quote.source!=='manual_pf'||quote.contextKey!==freightContextKey(context)||!Number.isFinite(Date.parse(quote.validUntil))||Date.parse(quote.validUntil)<=now||!Number.isSafeInteger(quote.customerExVat)||quote.customerExVat<0)throw Error('Fragtprisen skal bekræftes for denne kurv og adresse, før ordren kan bestilles.');
 return quote;
}
export async function claimFreight(quote,checkoutId,{now=Date.now()}={}){return lock(quote.id,async()=>{const record=await read(quote.id);if(record.checkoutId||!record.quote||record.contextKey!==quote.contextKey||record.revision!==quote.revision||Date.parse(record.quote.validUntil)<=now)throw Error('Fragttilbuddet er ikke længere tilgængeligt.');record.checkoutId=checkoutId;record.acceptedAt=new Date(now).toISOString();record.status='accepted';record.events.push({at:record.acceptedAt,type:'freight_accepted',checkoutId,revision:quote.revision});await save(record);});}
