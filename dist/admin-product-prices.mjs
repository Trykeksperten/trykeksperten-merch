const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const money=value=>new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(value/100);
export async function editProductPrices(product,api){
 const dialog=el('dialog');dialog.className='product-price-dialog';const title=el('h2',product.name),close=el('button','Luk'),body=el('div','Indlæser priser…');close.type='button';close.onclick=()=>dialog.close();dialog.append(close,title,body);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 const endpoint=`/api/admin/products/${encodeURIComponent(product.id)}/prices`;
 try{let data=await(await api(endpoint)).json();if(!dialog.isConnected)return;
 const selector=el('select');selector.setAttribute('aria-label','Variant');for(const variant of data.variants){const option=el('option',variant.label);option.value=variant.sku;selector.append(option);}
 const note=el('p','Varepriser pr. stk. Tryk, opstart og fragt beregnes separat. En manuel salgspris erstatter den automatiske pris for den valgte variant og bevares ved PF-opdateringer.');
 const content=el('div'),feedback=el('p');feedback.setAttribute('role','status');body.replaceChildren(note,selector,content,feedback);
 function draw(){const v=data.variants.find(v=>v.sku===selector.value);content.replaceChildren();
 content.append(el('p',`${v.custom?'Manuelle salgspriser':'Automatiske salgspriser'} · PF-priser opdateret: ${data.updatedAt?new Date(data.updatedAt).toLocaleDateString('da-DK'):'Ikke tilgængelige'}`));
 if(!v.sale.available){content.append(el('p',v.sale.message));}
 const costs=el('p',v.costTiers.length?`Købspriser (${v.currency}, ekskl. moms): ${v.costTiers.map(t=>`${t.min}+ stk.: ${v.currency==='DKK'?money(t.unitExVat):(t.unitExVat/100).toFixed(2)}`).join(' · ')}`:'Købspriser er ikke tilgængelige.');content.append(costs);
 const form=el('form'),table=el('table'),head=el('tr');for(const label of ['Antal fra','Køb ekskl. moms','Salg ekskl. moms','Salg inkl. moms'])head.append(el('th',label));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody'),inputs=[];
 for(const row of v.sale.tiers){const tr=el('tr'),cost=[...v.costTiers].sort((a,b)=>b.min-a.min).find(t=>t.min<=row.min),cell=el('td'),input=el('input'),incl=el('td',money(row.unitIncVat));input.type='number';input.min='0.01';input.max='1000000';input.step='0.01';input.required=true;input.value=(row.unitExVat/100).toFixed(2);input.setAttribute('aria-label',`Salgspris ekskl. moms fra ${row.min} stk.`);input.oninput=()=>{const cents=Math.round(Number(input.value)*100);incl.textContent=Number.isFinite(cents)?money(cents+Math.round(cents*.25)):'—';};cell.append(input);tr.append(el('td',`${row.min}+`),el('td',cost?money(cost.unitExVat):'—'),cell,incl);tbody.append(tr);inputs.push({min:row.min,input});}
 table.append(tbody);form.append(table);const save=el('button','Gem salgspriser'),reset=el('button','Brug automatiske priser');save.type='submit';save.disabled=!v.sale.available;reset.type='button';reset.disabled=!v.custom;const actions=el('div');actions.className='price-actions';actions.append(save,reset);form.append(actions);content.append(form);
 async function persist(tiers){save.disabled=true;reset.disabled=true;feedback.textContent='Gemmer…';try{data=await(await api(endpoint,'POST',{sku:v.sku,tiers})).json();draw();feedback.textContent=tiers===null?'Automatiske priser er gendannet.':'Salgspriserne er gemt og gælder i webshop, kurv og betaling. Genindlæs webshoppen for at se ændringen.';}catch(error){feedback.textContent=error.message;save.disabled=!v.sale.available;reset.disabled=!v.custom;}}
 form.onsubmit=event=>{event.preventDefault();persist(inputs.map(({min,input})=>({min,unitExVat:Math.round(Number(input.value)*100)})));};reset.onclick=()=>persist(null);
 }
 selector.onchange=()=>{feedback.textContent='';draw();};draw();
 }catch(error){body.textContent=error.message;}
}
