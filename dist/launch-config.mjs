// Set ordersEnabled to true only after payment approval. The timer never opens checkout.
export const launchConfig=Object.freeze({ordersEnabled:false,launchAt:'2026-10-14T17:22:55Z'});
export const launchMessage='Vi afventer godkendelse, før vi kan modtage ordrer. Du kan stadig udforske produkter og prøve at designe.';
export function countdown(now=Date.now()){
 const seconds=Math.max(0,Math.ceil((Date.parse(launchConfig.launchAt)-now)/1000));
 return [Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60];
}
export function blocksLaunchOrder(path,method){
 return !launchConfig.ordersEnabled&&method==='POST'&&(path==='/api/checkout/session'||/^\/api\/checkout\/[^/]+\/reauthorize$/.test(path));
}
