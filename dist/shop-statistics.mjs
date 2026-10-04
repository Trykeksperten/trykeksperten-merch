// Aggregate activity only: no visitor IDs, cookies, search terms or customer data.
export function sendStatistics(events){
 try{if(navigator.globalPrivacyControl||navigator.doNotTrack==='1')return;
 void fetch('/api/shop-statistics',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({events}),keepalive:true}).catch(()=>{});
 }catch{}
}
export function cartStatistics(before,after){
 const totals=rows=>{const values=new Map();for(const row of rows){const key=`${row.productId}:${row.sku}`;values.set(key,(values.get(key)||0)+(Number(row.quantity)||0));}return values;};
 const old=totals(before),next=totals(after);let added=0,removed=0;
 for(const key of new Set([...old.keys(),...next.keys()])){const delta=(next.get(key)||0)-(old.get(key)||0);if(delta>0)added+=delta;else removed-=delta;}
 return [...(added?[{type:'cart_add',units:added}]:[]),...(removed?[{type:'cart_remove',units:removed}]:[]),...(before.length&&!after.length?[{type:'cart_empty'}]:[])];
}
let lastPath;
export function trackShopPage(path){
 if(path===lastPath)return;lastPath=path;
 const page=path.startsWith('/design/')||path.startsWith('/produkt/')?'product':({'/':'home','/produkter':'products','/kurv':'cart','/betaling':'checkout','/om-smerch':'about','/kontakt':'contact','/brands':'brands','/specialproduktion':'special'})[path];
 if(page)sendStatistics([{type:'page_view',page}]);
}
