// Page information comes from the supplier copy, never from a product image.
const notebook = /notesb[oø]g|notesbøger|notebook|journal|notepad|notesblok/i;
const layouts = [
  ['Prikkede sider', /prikke[dt]|dotted/i],
  ['Ternede sider', /kvadrere[dt]|terne[dt]|squared|grid paper/i],
  ['Linjerede sider', /linjeret|linjerede|forede|foret|\blined\b|\bruled\b/i],
  ['Blanke sider', /blank[et]?\b|blanke|plain paper|unlined/i],
];
export function notebookPageInfo(product) {
  if (!notebook.test(product?.name || '')) return null;
  const name = product.name;
  const sentences = String(product.description || '').match(/[^.!?]+(?:[.!?]+|$)/g)?.map(s => s.trim()) || [];
  // Alternative models and bespoke printing are not selectable SKU variants.
  const alternative = /også|tilpas|dit eget|dit valg|du vælger|ethvert design|also|custom/i;
  const pageSentences = sentences.filter(s => /sider|ark|papir|pages|sheets|paper/i.test(s));
  const standard = pageSentences.filter(s => !alternative.test(s));
  const namedLayout = name.split(/\s[-–]\s/).at(-1);
  const matches = layouts.filter(([, pattern]) => pattern.test(namedLayout) && (namedLayout !== name || /sider|pages/i.test(namedLayout)));
  const inferred = layouts.filter(([, pattern]) => standard.some(sentence => pattern.test(sentence)));
  const selected = matches.length === 1 ? matches : inferred;
  const type = selected.map(([label]) => label).join(' · ');
  const custom = pageSentences.some(s => /tilpas|dit eget|dit valg|du vælger|ethvert design|custom/i.test(s));
  const customDetails = pageSentences.filter(s => /som standard/i.test(s));
  return {
    type,
    layouts: selected.map(([label]) => ({'Blanke sider':'blank','Linjerede sider':'lined','Prikkede sider':'dotted','Ternede sider':'squared'}[label])),
    details: [...new Set([...standard.filter(s => layouts.some(([, pattern]) => pattern.test(s))), ...customDetails])].join(' '),
    custom,
  };
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function notebookPagesHTML(product) {
  const info = notebookPageInfo(product);
  if (!info) return '';
  return `<aside class="pf-notebook-pages" aria-label="Sider og papir">${notebookPaperBadge(product)}<strong>Sider og papir</strong>${info.type ? `<p>${escape(info.type)}</p>` : !info.details ? '<p>Sidetype er ikke oplyst af leverandøren.</p>' : ''}${info.details ? `<p class="small">${escape(info.details)}</p>` : ''}${info.custom ? '<p class="small">Leverandøren beskriver mulighed for specialtilpassede sider. Kontakt os for at aftale dette før bestilling.</p>' : ''}</aside>`;
}

export const paperLayouts=Object.freeze([['blank','Blanke sider'],['lined','Linjerede sider'],['dotted','Prikkede sider'],['squared','Ternede sider']]);
export function notebookPaperBadge(product){
 const info=notebookPageInfo(product);if(!info?.layouts?.length)return '';
 const patterns={blank:'',lined:Array.from({length:5},(_,i)=>`<path d="M5 ${8+i*4}h14"/>`).join(''),squared:Array.from({length:5},(_,i)=>`<path d="M5 ${8+i*4}h14M${5+i*3.5} 5v23"/>`).join(''),dotted:Array.from({length:6},(_,r)=>Array.from({length:4},(_,c)=>`<circle cx="${6+c*4}" cy="${7+r*3.5}" r=".65" fill="currentColor" stroke="none"/>`).join('')).join('')};
 return `<span class="pf-paper-badge" role="img" aria-label="${escape(info.type)}" title="${escape(info.type)}">${info.layouts.map(layout=>`<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width=".8"><rect x="3" y="3" width="18" height="26"/>${patterns[layout]||''}</svg>`).join('')}<span class="pf-paper-label">${escape(info.type)}</span></span>`;
}
