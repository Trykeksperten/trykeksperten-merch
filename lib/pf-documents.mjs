import {readFile} from 'node:fs/promises';
let metadata;
const cache=new Map();
// Public files linked by PF's certification page, checked 2026-09-29.
// These are supplier scope certificates, not individual product test reports.
const certificates=[
 {id:'fsc',matches:['FSC®'],label:'FSC®-certifikat',url:'https://thedigitalcatalogue.com/pdf/2021/pfm/fsc_certificate.pdf'},
 {id:'grs-rcs',matches:['GRS','RCS'],label:'GRS / RCS-certifikat',url:'https://thedigitalcatalogue.com/pdf/grs_certificate_2024_2.pdf'},
 {id:'oeko-clothing',matches:['OEKO-TEX®'],clothing:true,label:'OEKO-TEX®-certifikat, beklædning',url:'https://thedigitalcatalogue.com/pdf/2021/oekotex_certificate.pdf'},
 {id:'oeko-textiles',matches:['OEKO-TEX®'],clothing:false,label:'OEKO-TEX®-certifikat, øvrige tekstiler',url:'https://thedigitalcatalogue.com/pdf/2021/oekotex_certificate_textiles_2024.pdf'}
];
export function documentCandidates(product,info){
 if(!/^[a-z0-9]+$/i.test(product.modelCode))return [];
 const docs=certificates.filter(c=>c.matches.some(m=>info?.certifications?.includes(m))&&(c.clothing===undefined||c.clothing===(product.shopCategory==='toj'))).map(({id,label,url})=>({id,label,url,kind:'certificate'}));
 if(info?.hasSizes)docs.unshift({id:'size-guide',label:'Størrelsesguide',kind:'size-guide',url:`https://www.pfconcept.com/pub/media/styleCard/${product.modelCode}_en.pdf`});
 return docs;
}
export async function listProductDocuments(product,{fetchImpl=fetch,info,now=Date.now()}={}){
 if(!info){metadata??=JSON.parse(await readFile(new URL('../data/pf-document-metadata.json',import.meta.url),'utf8'));info=metadata[product.id];}
 return (await Promise.all(documentCandidates(product,info).map(async doc=>{
  const cached=cache.get(doc.url);let available;
  if(cached&&cached.until>now)available=cached.available;
  else{try{const response=await fetchImpl(doc.url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(8000)});available=response.ok&&/application\/pdf/i.test(response.headers.get('content-type')||'');}catch{available=false;}
   cache.set(doc.url,{available,until:now+(available?3600000:60000)});while(cache.size>2000)cache.delete(cache.keys().next().value);
  }
  return available?doc:null;
 }))).filter(Boolean);
}
export async function downloadProductDocument(product,id,{fetchImpl=fetch}={}){
 const doc=(await listProductDocuments(product,{fetchImpl})).find(d=>d.id===id);if(!doc)throw Error('Dokumentet er ikke tilgængeligt.');
 const response=await fetchImpl(doc.url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!/application\/pdf/i.test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length'))>20*1024*1024)throw Error('Dokumentet kunne ikke hentes.');
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>20*1024*1024)throw Error('Dokumentet er for stort.');chunks.push(chunk);}
 const data=Buffer.concat(chunks);if(data.subarray(0,5).toString()!=='%PDF-')throw Error('Dokumentet er ikke en PDF.');
 return {data,filename:`${product.modelCode}-${doc.id}.pdf`};
}
