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
  const type = matches.length === 1 ? matches[0][0] : '';
  const custom = pageSentences.some(s => /tilpas|dit eget|dit valg|du vælger|ethvert design|custom/i.test(s));
  const customDetails = pageSentences.filter(s => /som standard/i.test(s));
  return {
    type,
    details: [...new Set([...standard.filter(s => layouts.some(([, pattern]) => pattern.test(s))), ...customDetails])].join(' '),
    custom,
  };
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function notebookPagesHTML(product) {
  const info = notebookPageInfo(product);
  if (!info) return '';
  return `<aside class="pf-notebook-pages" aria-label="Sider og papir"><strong>Sider og papir</strong>${info.type ? `<p>${escape(info.type)}</p>` : !info.details ? '<p>Sidetype er ikke oplyst af leverandøren.</p>' : ''}${info.details ? `<p class="small">${escape(info.details)}</p>` : ''}${info.custom ? '<p class="small">Leverandøren beskriver mulighed for specialtilpassede sider. Kontakt os for at aftale dette før bestilling.</p>' : ''}</aside>`;
}
