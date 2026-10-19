// Official replacement for DAWA. The public token is recommended by KDS until
// user accounts are introduced: https://confluence.kds.dk/display/ADV/Brugerstyring
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const unavailable='Adressesøgningen er midlertidigt utilgængelig. Prøv igen om lidt, eller kontakt hello@smerch.dk.';
async function request(path,params={}, {fetchImpl=fetch,env=process.env}={}){
 const url=new URL(path,'https://adressevaelger.dk');
 url.search=new URLSearchParams({...params,token:env.ADDRESS_PROVIDER_TOKEN||'adressevaelger123'});
 try{const response=await fetchImpl(url,{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});if(!response.ok)throw Error();const data=await response.json();if(data.status!=='ok')throw Error();return data;}catch{throw Error(unavailable);}
}
export function canonicalAddress(data){
 const a=data?.adresse,h=a?.husnummer,p=h?.postnummer;
 if(!UUID.test(a?.id_lokalid||'')||String(a.status)!=='3'||String(h?.status)!=='3'||!h.vejnavn||!h.husnummertekst||!/^\d{4}$/.test(p?.postnr||'')||!p.navn||a.virkningtil||h.virkningtil)throw Error('Adressen findes ikke som en gældende dansk adresse. Vælg en anden adresse.');
 const floor=a.etagebetegnelse||'',door=a.doerbetegnelse||'';
 const unit=[floor?`${floor}.`:'',door].filter(Boolean).join(' ');
 const street=[`${h.vejnavn} ${h.husnummertekst}`,unit,h.supplerendebynavn?.navn].filter(Boolean).join(', ');
 return {addressId:a.id_lokalid,street,postalCode:String(p.postnr),city:p.navn,country:'DK',floor,door,label:a.adressebetegnelse};
}
export async function resolveDanishAddress(id,options){
 if(!UUID.test(id||''))throw Error('Vælg din fulde adresse fra forslagene, inklusive etage og dør.');
 const address=canonicalAddress(await request(`/adresser/${id}`,{},options));
 if(address.addressId.toLowerCase()!==id.toLowerCase())throw Error('Adressen kunne ikke kontrolleres. Vælg den igen.');return address;
}
export async function searchDanishAddresses(input,options){
 if(input?.houseId){if(!UUID.test(input.houseId))throw Error('Ugyldig adresse.');const data=await request(`/husnumre/${input.houseId}/adresser`,{},options);return {suggestions:(data.adresser||[]).filter(a=>String(a.status)==='3'&&!a.virkningtil).slice(0,200).map(a=>({id:a.id_lokalid,type:'adresse',label:a.adressebetegnelse})),refine:(data.adresser||[]).length>200};}
 const query=String(input?.query||'').trim().replace(/\s+/g,' ');
 if(query.length<2)return {suggestions:[]};if(query.length>73)throw Error('Søg med højst 73 tegn.');
 const data=await request('/adresser/soeg',{tekst:query,maksimum:'12'},options);
 return {suggestions:(data.fund||[]).filter(a=>['adresse','husnummer','vejnavn','vejnavnhusnummer','navngivenvejpostnummer'].includes(a.type)&&a.titel).slice(0,12).map(a=>({id:a.id||'',type:a.type,label:a.titel}))};
}
export async function verifyDeliveryAddress(shipping,options){
 if(shipping?.country!=='DK')throw Error('Vi leverer kun til Danmark.');
 const address=await resolveDanishAddress(shipping?.addressId,options);
 for(const key of ['street','postalCode','city'])if(shipping[key]!==address[key])throw Error('Adressen er ændret. Vælg den igen fra forslagene.');
 return {...shipping,...address,addressSource:'DAR',addressVerifiedAt:new Date().toISOString()};
}
// Short-lived in-memory request counters; never store search text or addresses.
export function createAddressLimiter(){const counters=new Map();return (key,now=Date.now())=>{for(const [ip,value] of counters)if(value.until<=now)counters.delete(ip);if(!counters.has(key)){if(counters.size>=5000)return false;counters.set(key,{until:now+60_000,count:0});}return ++counters.get(key).count<=90;};}
