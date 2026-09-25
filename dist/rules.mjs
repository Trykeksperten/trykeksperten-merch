export const totalQuantity = line => Object.values(line.quantities||{}).reduce((a,b)=>a+Number(b),0);
export function validateLine(product,line){
 if(!product||product.status!=='active')return 'Produktet er ikke tilgængeligt.';
 if(!product.colors.some(c=>c.name===line.color))return 'Vælg en gyldig farve.';
 const entries=Object.entries(line.quantities||{});
 if(!entries.length||entries.some(([s,n])=>!product.sizes.includes(s)||!Number.isInteger(n)||n<0||n>100000))return 'Antal skal være hele, positive tal.';
 const quantity=totalQuantity(line);
 if(quantity<product.minimum||quantity>100000)return `Vælg mellem ${product.minimum} og 100.000 stk. i alt.`;
 const method=product.prints.find(m=>m.id===line.method);
 if(!method||!method.positions.includes(line.position))return 'Vælg en gyldig trykmetode og placering.';
 for(const [name,choices] of Object.entries(product.options||{}))if(!choices.includes(line.options?.[name]))return `Vælg ${name.toLowerCase()}.`;
 return null;
}
export function quoteLine(product,line){
 const error=validateLine(product,line);if(error)return {error};
 const quantity=totalQuantity(line),method=product.prints.find(m=>m.id===line.method);
 const tier=[...product.tiers].sort((a,b)=>b.min-a.min).find(t=>quantity>=t.min);
 const goods=tier?Math.round(tier.unit*quantity*100)/100:null;
 const print=method.unit===null?null:Math.round(method.unit*quantity*100)/100;
 return {quantity,unit:tier?.unit??null,goods,print,setup:method.setup,freight:null,subtotal:[goods,print,method.setup].some(v=>v===null)?null:goods+print+method.setup};
}
export function filterProducts(products,params){
 const value=k=>params.get(k)||'';
 const query=value('q').toLocaleLowerCase('da');
 const list=products.filter(p=>(!query||`${p.name} ${p.sku} ${p.description}`.toLocaleLowerCase('da').includes(query))&&(!value('kategori')||p.category===value('kategori'))&&(!value('farve')||p.colors.some(c=>c.name===value('farve')))&&(!value('brand')||p.brand===value('brand'))&&(!value('materiale')||p.material===value('materiale'))&&(!value('pris')||(value('pris')==='tilbud'?p.price===null:p.price!==null&&p.price<=Number(value('pris')))));
 const sort=value('sortering');
 if(sort==='navn')list.sort((a,b)=>a.name.localeCompare(b.name,'da'));
 if(sort==='pris-stigende'||sort==='pris-faldende')list.sort((a,b)=>a.price===null&&b.price===null?0:a.price===null?1:b.price===null?-1:sort==='pris-stigende'?a.price-b.price:b.price-a.price);
 return list;
}
