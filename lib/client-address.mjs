import {BlockList,isIP} from 'node:net';
const invalid=()=>Object.assign(new Error('Invalid trusted proxy configuration.'),{code:'PROXY_CONFIG_INVALID'});
function normalized(value){if(typeof value!=='string')return '';const ip=value.trim();if(ip.includes('%'))return '';if(ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4)return ip.slice(7);return isIP(ip)?ip:'';}
export function createClientAddressResolver({cidrs='',header='cf-connecting-ip'}={}){
 if(typeof cidrs!=='string'||cidrs.length>2048||!['cf-connecting-ip','x-forwarded-for'].includes(header))throw invalid();
 const trusted=new BlockList(),ranges=cidrs.trim()?cidrs.split(',').map(v=>v.trim()):[];
 if(ranges.length>32)throw invalid();
 for(const range of ranges){const [ip,prefix,...rest]=range.split('/'),version=isIP(ip),bits=Number(prefix);
  if(rest.length||ip.includes('%')||!version||!/^\d+$/.test(prefix||'')||!Number.isInteger(bits)||bits<1||bits>(version===4?32:128))throw invalid();
  trusted.addSubnet(ip,bits,version===4?'ipv4':'ipv6');
 }
 const isTrusted=ip=>{const version=isIP(ip);return !!version&&trusted.check(ip,version===4?'ipv4':'ipv6');};
 return req=>{
  const raw=typeof req.socket?.remoteAddress==='string'?req.socket.remoteAddress:'unknown';
  const peer=normalized(raw)||raw.slice(0,128)||'unknown';
  if(!isTrusted(peer))return peer;
  const value=req.headers?.[header];if(typeof value!=='string'||value.length>1024)return peer;
  if(header==='cf-connecting-ip')return normalized(value)||peer;
  const chain=value.split(',').map(normalized);if(chain.length>20||chain.some(ip=>!ip))return peer;
  let current=peer;
  for(let i=chain.length-1;i>=0;i--){if(!isTrusted(current))return current;current=chain[i];}
  return current;
 };
}
let cachedConfig,cachedResolver;
export function clientAddress(req,env=process.env){
 const cidrs=env.SMERCH_TRUSTED_PROXY_CIDRS||'',header=env.SMERCH_CLIENT_IP_HEADER||'cf-connecting-ip',key=JSON.stringify([cidrs,header]);
 if(key!==cachedConfig){cachedResolver=createClientAddressResolver({cidrs,header});cachedConfig=key;}
 return cachedResolver(req);
}
export function validateClientAddressConfiguration(env=process.env){createClientAddressResolver({cidrs:env.SMERCH_TRUSTED_PROXY_CIDRS||'',header:env.SMERCH_CLIENT_IP_HEADER||'cf-connecting-ip'});}

// Only the requesting admin's normalized network metadata; never all headers,
// cookies, credentials or other visitors. Exposed solely by the existing admin API.
export function clientAddressDiagnostics(req,env=process.env){
 return {transportAddress:normalized(req.socket?.remoteAddress)||null,resolvedClientAddress:clientAddress(req,env),edgeHeaderAddress:normalized(req.headers?.['cf-connecting-ip'])||null,forwardingConfigured:!!env.SMERCH_TRUSTED_PROXY_CIDRS,configuredHeader:env.SMERCH_TRUSTED_PROXY_CIDRS?(env.SMERCH_CLIENT_IP_HEADER||'cf-connecting-ip'):null};
}
