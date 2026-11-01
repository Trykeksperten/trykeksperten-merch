import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip);
export function preparePublicJSON(value){
 const source=Buffer.from(JSON.stringify(value));
 let compressed;
 return {source,gzip:()=>compressed??=(compress(source,{level:4}).catch(error=>{compressed=undefined;throw error;}))};
}
export async function sendPreparedJSON(req,res,prepared){
 const {source}=prepared;
 const acceptsGzip=String(req.headers['accept-encoding']||'').split(',').some(part=>/^gzip(?:\s*;|\s*$)/i.test(part.trim())&&!/;\s*q=0(?:\.0*)?\s*$/i.test(part));
 const zipped=acceptsGzip&&source.length>1024;
 const data=zipped?await prepared.gzip():source;
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache',Vary:'Accept-Encoding','Content-Length':data.length,...(zipped?{'Content-Encoding':'gzip'}:{})});
 res.end(req.method==='HEAD'?undefined:data);
}
export async function sendPublicJSON(req,res,value){return sendPreparedJSON(req,res,preparePublicJSON(value));}
