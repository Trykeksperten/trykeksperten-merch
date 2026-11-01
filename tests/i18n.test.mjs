import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {translate,setLanguage,installProductTranslations,translateTextLayerLabel,translateLogoLayerLabel} from '../dist/i18n-core.mjs';
import {filterPFProducts} from '../dist/pf-filters.mjs';
import {paymentDescription} from '../dist/purchase-flow.mjs';
import {aboutPage} from '../dist/about.mjs';

test('English catalogue translates tax modes, filters and accessible variant labels as complete phrases',()=>{
 const cases=[
  ['Privat','Individual'],
  ['Privat eller erhverv?','Individual or business?'],
  ['Privat Inkl. moms','Individual Including VAT'],
  ['Erhverv Ekskl. moms','Business Excluding VAT'],
  ['Prisvisning','Price display'],
  ['Du kan ændre valget øverst på siden.','You can change your choice at the top of the page.'],
  ['Filtrer +','Filter +'],
  ['Filtrer −','Filter −'],
  ['Vælg produktfarve','Choose product colour'],
  ['Produktsider','Product pages'],
  ['Priser inkl. moms. Tryk beregnes i designprocessen.','Prices include VAT. Printing is calculated as you design.'],
  ['Priser ekskl. moms. Tryk beregnes i designprocessen.','Prices exclude VAT. Printing is calculated as you design.'],
  ['Priser inkl. moms.','Prices include VAT.'],
  ['Priser ekskl. moms.','Prices exclude VAT.'],
  ['Priser ekskl. moms · ekskl. fragt','Prices excluding VAT · excluding delivery'],
  ['Model 123 i farven Grå','Model 123 in Grey'],
  ['Model 123 i farven vist variant','Model 123 in shown variant'],
  ['Sådan bestiller du','How to order'],
  ['Vælg tryk','Choose printing'],
  ['To personer med orange og turkis Stanley Quencher','Two people with orange and turquoise Stanley Quencher tumblers'],
  ['Indlæser dit mockup…','Loading your preview…'],
  ['Varer, tryk og opstart','Products, printing and setup'],
  ['Link til inspiration (valgfrit)','Inspiration link (optional)'],
  ['1. Vælg farve og antal','1. Choose colour and quantity'],
  ['4. Tilpas den valgte placering','4. Customise the selected position'],
  ['1 farve · Ret farver','1 colour · Change colours'],
  ['Tekststørrelse i procent','Text size as a percentage'],
  ['Fortsæt til kurv','Continue to cart'],
  ['Luk designstudiet','Close design studio'],
 ];
 for(const [source,expected] of cases){
  assert.equal(translate(source,'en'),expected,source);
  assert.equal(translate(source,'da'),source,'Danish must remain unchanged: '+source);
 }
 assert.equal(translate('Privatkunde Priserne','en'),'Privatkunde Priserne','Short labels must respect word boundaries');
});

test('design control label changes language without translating customer artwork',()=>{
 const artwork='Privat\nPriser inkl. moms. ÆØÅ & <logo>';
 const danish='Placér tekst: '+artwork,english='Position text: '+artwork;
 assert.equal(translateTextLayerLabel(danish,'en'),english);
 assert.equal(translateTextLayerLabel(english,'en'),english);
 assert.equal(translateTextLayerLabel(english,'da'),danish);
 assert.equal(translateTextLayerLabel(danish,'da'),danish);
 assert.equal(translateTextLayerLabel(artwork,'en'),artwork);
 assert.equal(translateTextLayerLabel(null,'en'),null);
});

test('logo positioning labels preserve complete original filenames across language changes',()=>{
 for(const name of ['Rød Forside.pdf','Privat ÆØÅ & <logo>.eps','Position logo: Placér logo.ai']){
  const danish='Placér '+name,english='Position logo: '+name;
  assert.equal(translateLogoLayerLabel(danish,'en'),english);
  assert.equal(translateLogoLayerLabel(english,'en'),english);
  assert.equal(translateLogoLayerLabel(english,'da'),danish);
  assert.equal(translateLogoLayerLabel(danish,'da'),danish);
 }
 assert.equal(translateLogoLayerLabel(null,'en'),null);
});

test('dynamic upload and colour messages translate as complete phrases for singular and plural counts',()=>{
 const cases=[
  ['✓ 1 logo tilføjet','✓ 1 logo added'],
  ['✓ 3 logoer tilføjet','✓ 3 logos added'],
  ['Farvetjek: cirka 1 farve','Colour check: approximately 1 colour'],
  ['Farvetjek: cirka 3 farver','Colour check: approximately 3 colours'],
  ['Du har valgt 1 farve til denne placering. Endelige farver kontrolleres før produktion.','You have selected 1 colour for this position. Final colours are checked before production.'],
  ['Du har valgt 3 farver til denne placering. Endelige farver kontrolleres før produktion.','You have selected 3 colours for this position. Final colours are checked before production.'],
  ['BLACK 6 C · Nærmeste Pantone (forslag)','BLACK 6 C · Nearest Pantone (suggestion)'],
  ['90 grader','90 degrees'],
 ];
 for(const [source,expected] of cases){assert.equal(translate(source,'en'),expected);assert.equal(translate(source,'da'),source);}
});

test('current payment copy and About paragraphs translate fully while Danish copy is retained',()=>{
 for(const lines of [[],[{decorations:[{text:'Customer artwork'}]}]]){
  const source=paymentDescription(lines,'da');
  assert.equal(translate(source,'en'),paymentDescription(lines,'en'));
  assert.equal(translate(source,'da'),source);
 }
 const paragraphs=[...aboutPage().matchAll(/<p>(.*?)<\/p>/g)].map(match=>match[1]);
 assert.equal(paragraphs.length,4);
 for(const paragraph of paragraphs){
  const english=translate(paragraph,'en');
  assert.notEqual(english,paragraph);
  assert.doesNotMatch(english,/\b(virksomhed|vores|udviklingen|hjælper|Mit navn)\b/);
  assert.equal(translate(paragraph,'da'),paragraph);
 }
});

test('English catalogue covers every product name and preserves Danish originals',async()=>{
 const translations=JSON.parse(await readFile(new URL('../dist/pf-english.json',import.meta.url)));
 const catalog=JSON.parse(await readFile(new URL('../data/pf-catalog-index.json',import.meta.url)));
 installProductTranslations(translations);
 setLanguage('en');
 for(const product of catalog.products){
  assert.ok(translations[product.name.replace(/\s+/g,' ').trim()],`Missing English name: ${product.id}`);
  assert.equal(translate(product.name,'da'),product.name);
 }
 assert.equal(translate('Tilføj til kurv'),'Add to cart');
 assert.equal(translate('1 farve · opstart 350,00 kr.'),'1 colour · setup 350,00 kr.');
 assert.equal(translate('Fra 1 stk.'),'From 1 item');
 assert.equal(translate('Fra 11 stk.'),'From 11 items');
 assert.equal(translate('1+ stk.'),'1+ items');
 assert.equal(translate('Trykeksperten ApS'),'Trykeksperten ApS');
 const p=catalog.products.find(p=>p.id==='pf-100942');
 const prices={available:true,products:{[p.id]:{fromIncVat:37500}},skus:Object.fromEntries(p.variants.map(v=>[v.sku,true]))};
 assert.equal(filterPFProducts([p],new URLSearchParams('q=water bottle'),prices,()=> 'recommended').length,1);
 setLanguage('da');
 assert.equal(translate('Tilføj til kurv'),'Tilføj til kurv');
});
