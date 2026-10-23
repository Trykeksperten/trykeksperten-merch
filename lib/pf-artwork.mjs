import {requiredOrderMockup} from './order-mockups.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readCheckout} from './checkout.mjs';
import {readTestArtwork} from './pf-test-artwork.mjs';

const types={'application/pdf':'application/pdf','application/illustrator':'application/illustrator','application/postscript':'application/postscript','application/vnd.corel-draw':'application/vnd.corel-draw'};
const signature=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
const key=(checkoutId,artworkId,expires)=>`${checkoutId}:${artworkId}:${expires}`;

export function artworkURL(checkoutId,artworkId,{env=process.env,expires=Date.now()+7*86400000}={}){
 const secret=env.SMERCH_ARTWORK_SIGNING_SECRET,base=env.SMERCH_PUBLIC_BASE_URL;
 if(!secret||secret.length<32)throw Error('Signeringsnøglen til PF-filer mangler.');
 const origin=new URL(base);if(origin.protocol!=='https:')throw Error('PF-filer kræver en offentlig HTTPS-adresse.');
 const expiry=Math.floor(expires/1000),url=new URL('/api/pf-artwork',origin);url.searchParams.set('checkout',checkoutId);url.searchParams.set('artwork',artworkId);url.searchParams.set('expires',String(expiry));url.searchParams.set('signature',signature(key(checkoutId,artworkId,expiry),secret));return url.href;
}

export async function readSignedArtwork(query,{env=process.env,now=Date.now()}={}){
 const checkoutId=query.get('checkout')||'',artworkId=query.get('artwork')||'',expires=query.get('expires')||'',supplied=query.get('signature')||'',secret=env.SMERCH_ARTWORK_SIGNING_SECRET;
 if(!/^(?:pay|test)-[a-f0-9-]{36}$/.test(checkoutId)||!artworkId||!/^\d{10}$/.test(expires)||Number(expires)*1000<=now||!secret||secret.length<32||!(/^[a-f0-9]{64}$/.test(supplied)))throw Error('Linket til trykfilen er ugyldigt eller udløbet.');
 const expected=signature(key(checkoutId,artworkId,expires),secret);
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(supplied,'hex')))throw Error('Linket til trykfilen er ugyldigt.');
 const test=checkoutId.startsWith('test-'),checkout=await (test?readTestArtwork(checkoutId):readCheckout(checkoutId));
 if(test?checkout.status!=='ready'||!checkout.orderId:!['authorized','capture_reconciliation','paid'].includes(checkout.status))throw Error('Trykfilen er ikke tilgængelig.');
 const mockupMatch=/^mockup-(\d+)-(\d+)$/.exec(artworkId);
 if(mockupMatch){
  const mockup=requiredOrderMockup(checkout,Number(mockupMatch[1]),Number(mockupMatch[2]));
  return {data:Buffer.from(mockup.base64,'base64'),mimeType:'image/png',name:mockup.filename};
 }
 const textMatch=/^text-(\d+)-(\d+)$/.exec(artworkId);
 if(textMatch){const decoration=checkout.lines[Number(textMatch[1])]?.decorations[Number(textMatch[2])];if(!decoration?.text?.trim())throw Error('Tekstfilen findes ikke.');const body=[`Ordre: ${checkout.id}`,`Produkt: ${checkout.lines[Number(textMatch[1])].productId}`,`Placering: ${decoration.position}`,`Mål: ${decoration.width} x ${decoration.height} mm`,`Tekst: ${decoration.text}`,`Skrifttype: ${decoration.textPlacement?.font||''}`,`Justering: ${decoration.textPlacement?.align||''}`,`Rotation: ${decoration.textPlacement?.rotation||0} grader`,`Farveønske: ${decoration.ink||''}`].join('\n');return {data:Buffer.from(body),mimeType:'text/plain; charset=utf-8',name:`${artworkId}.txt`};}
 const asset=checkout.artworks?.find(row=>row.id===artworkId);
 if(!asset||!types[asset.type])throw Error('Trykfilen er ikke tilgængelig.');
 return {data:await readFile(asset.path),mimeType:types[asset.type],name:asset.name};
}
