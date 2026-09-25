import {createHmac,timingSafeEqual} from 'node:crypto';

export function verifyPFRelaySignature(raw,headers,secret,now=Date.now()){
 if(!secret||!Buffer.isBuffer(raw))return false;
 const timestamp=String(headers['x-smerch-timestamp']||''),signature=String(headers['x-smerch-signature']||'').replace(/^sha256=/,'');
 if(!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
