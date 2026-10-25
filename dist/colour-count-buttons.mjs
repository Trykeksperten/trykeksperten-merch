const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function colourCountButtons({id,label,choices,value}){
 const selected=choices.find(choice=>choice.colors===value),samePrice=choices.length>1&&choices.every(choice=>choice.priceConfirmed&&choice.price===choices[0].price);
 return `<div><div class="pf-colour-count-buttons" role="group" aria-label="${escape(label)}">${choices.map(choice=>`<button type="button" data-color-option="${escape(id)}" data-color-count="${choice.colors}" aria-label="${choice.colors} ${choice.colors===1?'farve':'farver'}" aria-pressed="${choice.colors===value}">${choice.colors}</button>`).join('')}</div><p class="pf-colour-count-price">${escape(selected?.price||'Det valgte farveantal er ikke tilgængeligt med denne metode.')}${samePrice?'<small>Samme pris uanset antal farver.</small>':''}</p></div>`;
}
