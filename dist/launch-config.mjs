// Closed fallback shared by server and browser. Only server release status can open checkout.
export const launchConfig=Object.freeze({ordersEnabled:false,launchAt:'2026-10-26T11:00:00Z'});
export const launchMessage='Vi afventer godkendelse, før vi kan modtage ordrer. Du kan stadig udforske produkter og prøve at designe.';
export function countdown(now=Date.now()){
 const seconds=Math.max(0,Math.ceil((Date.parse(launchConfig.launchAt)-now)/1000));
 return [Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60];
}
export function blocksLaunchOrder(path,method,configuration=launchConfig){
 return configuration?.ordersEnabled!==true&&method==='POST'&&(path==='/api/checkout/session'||/^\/api\/checkout\/[^/]+\/reauthorize$/.test(path));
}
