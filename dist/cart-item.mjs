import {foilFinish} from './foil-options.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function cartItemHTML(line,product,variant){
 const editURL=line.companyTemplate?'/virksomhed':`/design/${escape(line.productId)}?cart=${escape(line.id)}`;
 const decorations=line.decorations||[],files=new Map();
 for(const decoration of decorations)for(const file of decoration.artworks?.length?decoration.artworks.map(art=>art.logo):decoration.logo?[decoration.logo]:[])if(file?.id)files.set(file.id,file);
 return `<article class="cart-item pf-cart-item" data-pf-line="${escape(line.id)}">
 <div class="pf-cart-item-heading">${product?.brand?`<p class="eyebrow">${escape(product.brand)}</p>`:''}<a class="product-title" href="${editURL}">${escape(product?.name||'Produktet er ikke længere tilgængeligt')}</a></div>
 ${variant?`<div class="cart-image pf-cart-mockup" data-pf-mockup="${escape(line.id)}"><img src="${escape(variant.images?.[0]||'')}" alt="${escape(product?.name)}" loading="lazy" decoding="async"></div>`:'<div class="cart-image"></div>'}
 <div class="pf-cart-item-info">
 <p class="small muted">${escape([variant?.color,variant?.size].filter(Boolean).join(' · '))}</p>
 <p class="small">${decorations.length?'Levering: 7–10 hverdage efter godkendt korrektur.':'Levering: 2–4 hverdage uden logo.'}</p>
 <div class="pf-cart-decoration-info">${decorations.length?decorations.map(decoration=>`<p class="small">${escape([decoration.method,decoration.position,decoration.foilFinish?foilFinish(decoration.foilFinish)?.label:''].filter(Boolean).join(' · ')||'Med tryk')}${decoration.text?`<span class="pf-cart-design-text">“${escape(decoration.text)}”</span>`:''}</p>`).join(''):'<p class="small muted">Uden tryk</p>'}</div>
 ${files.size?`<details class="pf-cart-files"><summary>Logofiler</summary>${[...files.values()].map(file=>`<button type="button" class="text-link" data-pf-logo="${escape(file.id)}" data-name="${escape(file.name)}">${escape(file.name||'Hent originalfil')}</button>`).join('')}</details>`:''}
 </div>
 <div class="pf-cart-controls"><label>Antal<input type="number" inputmode="numeric" min="1" max="100000" step="1" value="${escape(line.quantity)}" data-pf-quantity="${escape(line.id)}" aria-label="Antal ${escape(product?.name||'produkter')}"></label>${line.companyTemplate?'<span class="small muted">Fast virksomhedsdesign</span>':`<a class="text-link pf-cart-edit" href="${editURL}" aria-label="Rediger design">Rediger design</a>`}<button type="button" class="text-link" data-pf-remove="${escape(line.id)}">Slet</button></div>
 <p class="error pf-cart-line-error" data-pf-line-error></p><div data-pf-line-price class="pf-line-price" aria-live="polite">Beregner pris…</div></article>`;
}
