// Match data already loaded for staff; searching never changes an order.
export function matchesOrder(query,{checkout,orders=[],extra=[]}={}){
 const c=checkout||{},shipping=c.shipping||orders[0]?.shipping||{},billing=c.billing||{};
 const fields=[c.id,shipping.name,shipping.company,shipping.email,shipping.phone,billing.company,billing.email,billing.cvr,...extra];
 for(const order of orders)fields.push(order.id,order.purchaseOrderNumber,order.pfOrderNumber,order.shipping?.name,order.shipping?.company,order.shipping?.email,...(order.shipment?.tracking||[]));
 for(const line of [...(c.lines||[]),...orders.flatMap(order=>order.lines||[])])fields.push(line.productId,line.sku,line.productName,c.productNames?.[line.productId]);
 const normalise=value=>String(value??'').normalize('NFC').toLocaleLowerCase('da'),text=fields.map(normalise).join(' '),words=normalise(query).trim().split(/\s+/).filter(Boolean);
 return words.every(word=>text.includes(word));
}
