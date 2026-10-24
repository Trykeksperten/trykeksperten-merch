const clean=value=>typeof value==='string'?value.trim():'';
const first=(...values)=>values.map(clean).find(Boolean)||'';
function address(source){
 if(!source)return [];
 if(typeof source==='string')return source.split(/\r?\n/).map(clean).filter(Boolean);
 const value=source.address||source;
 if(typeof value==='string')return address(value);
 return [clean(value.street),clean(value.street2),clean(value.deliveryComment||source.deliveryComment),[clean(value.postalCode),clean(value.city)].filter(Boolean).join(' '),clean(value.country)].filter(Boolean);
}
const sameAddress=(a,b)=>a.map(s=>s.toLowerCase().replace(/\s+/g,' ').replace(/^danmark$/,'dk')).join('|')===b.map(s=>s.toLowerCase().replace(/\s+/g,' ').replace(/^danmark$/,'dk')).join('|');
export function customerContactData(order,checkout){
 const shipping=order.shipping||{},customer=checkout?.shipping||shipping,billing=checkout?.billing||order.billing||{};
 const name=first(customer.name,shipping.name),company=first(billing.company,customer.company,shipping.company);
 const contact=first(billing.contactPerson,customer.contactPerson,shipping.contactPerson);
 const email=first(customer.email,shipping.email,billing.email),phone=first(customer.phone,shipping.phone);
 const delivery=address(shipping).length?address(shipping):address(customer),invoice=address(billing);
 const addresses=invoice.length&&delivery.length&&sameAddress(invoice,delivery)?[{label:'Fakturerings- og leveringsadresse',lines:delivery}]:[{label:'Leveringsadresse',lines:delivery},{label:'Faktureringsadresse',lines:invoice}].filter(item=>item.lines.length);
 return {name,company,cvr:clean(billing.cvr),contact:contact!==name?contact:'',email,phone,addresses};
}
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function customerContactPanel(order,checkout){
 const data=customerContactData(order,checkout),panel=el('section');panel.className='order-customer-contact';panel.setAttribute('aria-label','Kundens kontaktoplysninger');panel.append(el('h2','Kundekontakt'));
 const grid=el('div');grid.className='customer-contact-grid';const identity=el('div');
 if(data.name)identity.append(el('strong',data.name));
 if(data.company&&data.company!==data.name)identity.append(el('p',data.company));
 if(data.cvr)identity.append(el('p','CVR: '+data.cvr));
 if(data.contact)identity.append(el('p','Kontaktperson: '+data.contact));
 for(const [value,scheme] of [[data.phone,'tel:'],[data.email,'mailto:']]){if(!value)continue;const row=el('p'),link=el('a',value);const target=scheme==='tel:'?value.replace(/[\s().-]/g,''):value;if(scheme==='tel:'?/^\+?\d+$/.test(target):/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(target))link.href=scheme+target;row.append(link);identity.append(row);}
 if(identity.children.length)grid.append(identity);
 for(const item of data.addresses){const block=el('div');block.append(el('h3',item.label));for(const line of item.lines)block.append(el('p',line==='DK'?'Danmark':line));grid.append(block);}
 if(grid.children.length)panel.append(grid);else panel.append(el('p','Der er ingen kontaktoplysninger registreret på ordren.'));
 return panel;
}
