import {BlockList,isIP,SocketAddress} from 'node:net';
const invalid=()=>Object.assign(new Error('Invalid trusted proxy configuration.'),{code:'PROXY_CONFIG_INVALID'});
function normalized(value){
 if(typeof value!=='string')return '';const ip=value.trim(),version=isIP(ip);if(!version||ip.includes('%'))return '';
 if(version===4)return ip;
 const canonical=new SocketAddress({address:ip,family:'ipv6'}).address;
 return canonical.startsWith('::ffff:')&&isIP(canonical.slice(7))===4?canonical.slice(7):canonical;
}
export function createClientAddressResolver({cidrs='',header='cf-connecting-ip',mode='cidr',renderRuntime=false}={}){
 if(typeof cidrs!=='string'||cidrs.length>2048||!['cf-connecting-ip','x-forwarded-for'].includes(header))throw invalid();
 if(!['cidr','render-workspace'].includes(mode))throw invalid();
 // Public Render ingress overwrites CF-Connecting-IP. Direct private requests
 // can forge it: this opt-in trusts every sender in the Render workspace.
 // Runtime metadata prevents accidental use elsewhere; it is not attestation
 // of the individual request's origin. Never enable this mode automatically.
 const renderWorkspace=mode==='render-workspace';
 if(renderWorkspace&&(renderRuntime!==true||cidrs.trim()||header!=='cf-connecting-ip'))throw invalid();
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
  if(renderWorkspace&&!isIP(peer))return peer;
  if(!renderWorkspace&&!isTrusted(peer))return peer;
  const value=req.headers?.[header];if(typeof value!=='string'||value.length>1024)return peer;
  if(header==='cf-connecting-ip')return normalized(value)||peer;
  const chain=value.split(',').map(normalized);if(chain.length>20||chain.some(ip=>!ip))return peer;
  let current=peer;
  for(let i=chain.length-1;i>=0;i--){if(!isTrusted(current))return current;current=chain[i];}
  return current;
 };
}
let cachedConfig,cachedResolver;
function configuration(env){
 return {cidrs:env.SMERCH_TRUSTED_PROXY_CIDRS||'',header:env.SMERCH_CLIENT_IP_HEADER||'cf-connecting-ip',mode:env.SMERCH_PROXY_TRUST_MODE||'cidr',renderRuntime:env.RENDER==='true'&&env.RENDER_SERVICE_TYPE==='web'};
}
export function clientAddress(req,env=process.env){
 const config=configuration(env),key=JSON.stringify(config);
 if(key!==cachedConfig){cachedResolver=createClientAddressResolver(config);cachedConfig=key;}
 return cachedResolver(req);
}
export function validateClientAddressConfiguration(env=process.env){createClientAddressResolver(configuration(env));}

// Only the requesting admin's normalized network metadata; never all headers,
// cookies, credentials or other visitors. Exposed solely by the existing admin API.
export function clientAddressDiagnostics(req,env=process.env){
 const config=configuration(env),renderWorkspace=config.mode==='render-workspace';
 const configured=renderWorkspace||(typeof config.cidrs==='string'&&!!config.cidrs.trim());
 return {transportAddress:normalized(req.socket?.remoteAddress)||null,resolvedClientAddress:clientAddress(req,env),edgeHeaderAddress:normalized(req.headers?.['cf-connecting-ip'])||null,forwardingConfigured:configured,configuredHeader:configured?config.header:null,trustMode:renderWorkspace?'render-workspace':configured?'cidr':'socket',privateNetworkTrusted:renderWorkspace};
}
