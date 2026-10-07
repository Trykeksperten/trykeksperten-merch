import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip);
export async function sendPublicJSON(req,res,value){
 const source=Buffer.from(JSON.stringify(value));
 const acceptsGzip=String(req.headers['accept-encoding']||'').split(',').some(part=>/^gzip(?:\s*;|\s*$)/i.test(part.trim())&&!/;\s*q=0(?:\.0*)?\s*$/i.test(part));
 const zipped=acceptsGzip&&source.length>1024;
 const data=zipped?await compress(source,{level:4}):source;
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache',Vary:'Accept-Encoding','Content-Length':data.length,...(zipped?{'Content-Encoding':'gzip'}:{})});
 res.end(req.method==='HEAD'?undefined:data);
}
