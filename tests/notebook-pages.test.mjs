import test from 'node:test';
import assert from 'node:assert/strict';
import {notebookPageInfo, notebookPagesHTML} from '../dist/notebook-pages.mjs';

test('PF page descriptions are surfaced verbatim for each layout', () => {
  for (const description of [
    'Notesbog med linjeret genbrugspapir (70 g/m²) 80 ark med afrundede hjørner.',
    'Indeholder 192 elfenbensfarvede, kvadrerede sider.',
    'Indeholder 240 prikkede sider.',
    'Indeholder 192 sider med blankt, elfenbensfarvet papir.',
    'Har 20 ark (40 sider) med halvt prikket og halvt blankt layout og en sort skrivestift.',
  ]) assert.equal(notebookPageInfo({name:'Notesbog', description}).details, description);
});

test('supplier spelling linieret is shown as lined paper on the product page', () => {
  const product = {
    name: 'A5 notesbog',
    description: 'A5 notesbog med 80 ark beige linieret papir (70 g/m2) med elastik lukning og makeringsbånd.',
  };

  assert.deepEqual(notebookPageInfo(product).layouts, ['lined']);
  const html = notebookPagesHTML(product);
  assert.match(html, /<p>Linjerede sider<\/p>/);
  assert.ok(html.includes(product.description));
  assert.doesNotMatch(html, /ikke oplyst/);
});

test('alternative Moleskine models do not become paper choices', () => {
  const info = notebookPageInfo({name:'Moleskine notesbog - blank', description:'Indeholder 192 sider med blankt, elfenbensfarvet papir. Siderne findes også med linjeret, prikket og kvadreret papir.'});
  assert.equal(info.type, 'Blanke sider');
  assert.equal(info.details, 'Indeholder 192 sider med blankt, elfenbensfarvet papir.');
  assert.equal(info.custom, false);
});

test('custom printing is explained as a request, not an orderable variant', () => {
  const html = notebookPagesHTML({name:'Novella notesbog',description:'Arkene er som standard ensfarvede, eller du kan tilføje arkene et design du vælger, såsom linjer, firkanter eller dit eget tilpassede design.'});
  assert.match(html, /som standard ensfarvede/);
  assert.match(html, /Kontakt os/);
  assert.doesNotMatch(html, /<select|<input|ikke oplyst/);
});

test('unknown page layouts are not inferred from covers and other products are unaffected', () => {
  assert.equal(notebookPageInfo({name:'Blank hardcover notesbog',description:'En slank og holdbar blank hardcover notesbog.'}).type, '');
  assert.match(notebookPagesHTML({name:'Notesbog',description:''}), /ikke oplyst/);
  assert.equal(notebookPagesHTML({name:'Vandflaske',description:'Blank overflade.'}), '');
});

test('catalogue descriptions identify page layouts despite naming and optional print wording', () => {
  const examples = [
    [{name:'Shale stenpapir cahier notatbog', description:'Rivefast cahier notatbog med 32 ark hvidt stenpapir med linjer.'}, ['lined']],
    [{name:'Liss A5 spiralblok', category:'Notesbøger med hard cover', description:'Indholdet består af 70 linjerede, cremefarvede ark (70 g/m²).'}, ['lined']],
    [{name:'Scribe Plus A5 notesbog', description:'100 linjerede ark af genvundet papir, hvor du også kan få trykt dit logo.'}, ['lined']],
    [{name:'Slyk notesbog', description:'Den holder to indre notesbøger - en prikket og en linjeret. Genopfyldning til hæfterne findes separat med ternet papir.'}, ['dotted', 'lined']],
    [{name:'Notesbog', description:'Indeholder 80 ark cremefarvet papir. Fås også med ternet papir.'}, []],
  ];

  for (const [product, expected] of examples) {
    assert.deepEqual(notebookPageInfo(product).layouts, expected, product.name);
  }
});

test('supplier text is escaped', () => {
  const html = notebookPagesHTML({name:'Notesbog',description:'80 blanke sider <img src=x onerror=alert(1)>'});
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('paper type is inferred from actual page descriptions and preserves mixed layouts',()=>{
 for(const [description,key] of [['80 linjerede sider.','lined'],['192 kvadrerede sider.','squared'],['240 prikkede sider.','dotted'],['192 sider med blankt papir.','blank']])assert.deepEqual(notebookPageInfo({name:'Notesbog',description}).layouts,[key]);
 assert.deepEqual(notebookPageInfo({name:'Notesbog',description:'40 sider med halvt prikket og halvt blankt layout.'}).layouts,['dotted','blank']);
 assert.deepEqual(notebookPageInfo({name:'Notesbog - blank',description:'Blanke sider. Findes også med linjeret papir.'}).layouts,['blank']);
 assert.deepEqual(notebookPageInfo({name:'Notesbog',description:'Sort omslag. Fås også med prikkede sider.'}).layouts,[]);
});
