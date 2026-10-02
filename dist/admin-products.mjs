import {editProductPrices} from './admin-product-prices.mjs';
const money=value=>new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(value/100);
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
export async function renderProducts(parent,api){
 const host=node('section');parent.replaceChildren(host);
 host.textContent='Indlæser hele produktkataloget…';
 try{
 const {products}=await (await api('/api/admin/products')).json();if(!host.isConnected)return;
 host.replaceChildren();const intro=node('p','Alle importerede PF-produkter bevares her. Vis eller skjul produkter i webshoppen uden at slette dem. Aktuelle priser og aktive varianter kræves stadig for offentlig visning. Nye PF-produkter er skjult som udgangspunkt.');intro.className='intro';
 const filters=node('div');filters.className='product-admin-filters';
 const search=node('input');search.type='search';search.placeholder='Søg navn, brand eller varenummer';search.setAttribute('aria-label','Søg produkter');
 const select=(label,options)=>{const wrap=node('label',label),el=node('select');for(const [value,title]of options){const o=node('option',title);o.value=value;el.append(o);}wrap.append(el);filters.append(wrap);return el;};
 const searchLabel=node('label','Søg');searchLabel.append(search);filters.append(searchLabel);
 const group=select('Produktgruppe',[['','Alle produktgrupper'],...[...new Set(products.map(p=>p.group))].sort().map(s=>[s,s])]);
 const brand=select('Brand',[['','Alle brands'],...[...new Set(products.map(p=>p.brand))].sort().map(s=>[s,s])]);
 const state=select('Synlighed',[['','Alle produkter'],['visible','Valgt til webshop'],['hidden','Skjult i webshop']]);
 const stats=node('p'),feedback=node('p'),list=node('div'),pager=node('div');feedback.setAttribute('role','status');list.className='product-admin-grid';pager.className='product-admin-pager';host.append(intro,filters,stats,feedback,list,pager);
 let page=0;const size=36;
 function draw(){const q=search.value.trim().toLocaleLowerCase('da'),matches=products.filter(p=>(!q||`${p.name} ${p.id} ${p.brand} ${p.category}`.toLocaleLowerCase('da').includes(q))&&(!group.value||p.group===group.value)&&(!brand.value||p.brand===brand.value)&&(!state.value||(state.value==='visible')===p.visible));page=Math.min(page,Math.max(0,Math.ceil(matches.length/size)-1));stats.textContent=`${products.length} produkter i alt · ${products.filter(p=>p.visible).length} valgt til webshop · ${matches.length} matcher filtrene`;list.replaceChildren();pager.replaceChildren();
 for(const p of matches.slice(page*size,(page+1)*size)){
 const card=node('article');card.className='product-admin-card';if(p.image){const image=node('img');image.src=p.image;image.alt=p.name;image.loading='lazy';card.append(image);}
 card.append(node('small',`${p.brand} · ${p.id}`),node('h2',p.name),node('p',`${p.category} · ${p.variantCount} varianter`),node('strong',p.visible?'Valgt til webshop':'Skjult i webshop'));
 const priceBox=node('div');priceBox.className='product-admin-prices';
 const renderPrice=()=>{priceBox.replaceChildren();const price=p.priceSummary;if(!price){priceBox.append(node('p','Aktuelle priser ikke tilgængelige'));return;}for(const [label,value]of [['Køb',price.costExVat],['Salg',price.saleExVat]]){const row=node('div');row.append(node('span',label),node('strong',money(value)));priceBox.append(row);}priceBox.append(node('small',`Pr. stk. ekskl. moms · ved ${price.quantity} stk.`),node('small',`Salg inkl. moms: ${money(price.saleIncVat)}`),node('small',`${price.label?price.label+' · ':''}${price.sku}`));};renderPrice();card.append(priceBox);
 const details=node('details');details.append(node('summary','Produktdetaljer'),node('p',`${p.activeVariants} aktive varianter`),node('p',`Farver: ${p.colors.join(', ')||'Ikke oplyst'}`),node('p',`Trykmuligheder: ${p.methods.join(', ')||'Ikke oplyst'}`));card.append(details);
 const priceButton=node('button','Rediger pris');priceButton.type='button';priceButton.className='action light';priceButton.onclick=()=>editProductPrices(p,api,summary=>{p.priceSummary=summary;renderPrice();});card.append(priceButton);
 const toggle=node('button',p.visible?'Skjul i webshop':'Vis i webshop');toggle.className='action'+(p.visible?' light':'');toggle.type='button';toggle.setAttribute('aria-label',`${toggle.textContent}: ${p.name}`);toggle.onclick=async()=>{toggle.disabled=true;feedback.textContent='';try{const updated=await(await api('/api/admin/products','POST',{id:p.id,visible:!p.visible})).json();Object.assign(p,updated);draw();feedback.textContent=`${p.name}: ${p.visible?'valgt til webshop':'skjult i webshop'}. Genindlæs webshoppen for at se ændringen.`;}catch(error){feedback.textContent=error.message;toggle.disabled=false;}};card.append(toggle);list.append(card);
 }
 if(!matches.length)list.append(node('p','Ingen produkter matcher filtrene.'));
 const prev=node('button','← Forrige'),next=node('button','Næste →');prev.disabled=page===0;next.disabled=(page+1)*size>=matches.length;prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};pager.append(prev,node('span',`Side ${page+1} af ${Math.max(1,Math.ceil(matches.length/size))}`),next);
 }
 search.oninput=()=>{page=0;draw();};for(const control of [group,brand,state])control.onchange=()=>{page=0;draw();};draw();
 }catch(error){host.textContent=error.message;}
}
