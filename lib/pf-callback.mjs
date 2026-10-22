import {callbackAuthorized} from './pf-orders.mjs';
import {verifyPFRelaySignature} from './webhook-signing.mjs';

// Direct PF notifications use Basic Auth over HTTPS. Signed relay remains the
// default; proof inbox authentication is independent and is never relaxed.
export async function readPFCallback(req,kind,{env=process.env,limit=1024*1024}={}){
 if(!['confirmation','status','shipment'].includes(kind))throw Error('Ukendt PF-besked.');
 if(!callbackAuthorized(req,env))throw Object.assign(Error('PF-adgang kræves.'),{statusCode:401});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON kræves.');
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Anmodningen er for stor.');chunks.push(chunk);}
 const raw=Buffer.concat(chunks),mode=env.PF_CALLBACK_AUTH_MODE||'relay';
 if(mode==='basic'){
  if(!env.PF_GATEWAY_SENDER_ID||String(env.PF_CALLBACK_PASSWORD||'').length<32)throw Error('Direkte PF-modtagelse er ikke konfigureret sikkert.');
 }else if(mode!=='relay'||!verifyPFRelaySignature(raw,req.headers,env.PF_WEBHOOK_SIGNING_SECRET))throw Error('PF-relæets signatur mangler eller er ugyldig.');
 const payload=JSON.parse(raw.toString()),body=kind==='status'?payload?.StatusChangedNotification:kind==='shipment'?payload?.ShipmentNotification:payload;
 if(mode==='basic'&&(body?.receiverId!==env.PF_GATEWAY_SENDER_ID||(kind!=='confirmation'&&body?.senderId!=='PF')))throw Error('PF-beskeden matcher ikke vores Gateway-konto.');
 return payload;
}
