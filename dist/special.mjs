const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let draft = {}, references = [];
const fields = [
 ['name','Navn','text',true], ['email','E-mail','email',true],
 ['company','Virksomhed / forening (valgfrit)','text',false], ['phone','Telefon (valgfrit)','tel',false],
 ['quantity','Ønsket antal','number',true], ['budget','Samlet budget i kr. (valgfrit)','number',false],
 ['deadline','Ønsket leveringsdato (valgfrit)','date',false], ['reference','Link til inspiration (valgfrit)','url',false]
];
export function specialPage(product){const prefill=product?`${product.name} (varenummer ${product.modelCode}). Ønsket antal og tryk: `:'';return `<section class="wrap section review special-page"><p class="eyebrow">SPECIALPRODUKTION</p><h1>Har du noget<br>helt særligt i tankerne?</h1><p class="intro">${product?`Forespørgsel om ${esc(product.name)}. Pris og muligheder skal afklares, før der kan afgives tilbud.`:'Et produkt, du ikke kan finde, et særligt design eller en større produktion? Beskriv din idé, så vi kan afklare mulighederne.'}</p><div class="cart-layout"><form id="special-form"><label>Jeg handler som<select name="customerType"><option value="private" ${draft.customerType==='private'?'selected':''}>Privatperson</option><option value="business" ${draft.customerType==='business'?'selected':''}>Virksomhed</option><option value="association" ${draft.customerType==='association'?'selected':''}>Forening</option></select></label><label>Hvad ønsker du? *<textarea name="description" rows="5" maxlength="4000" required placeholder="Fortæl om produktet, materialer, farver og dit ønskede tryk">${esc(draft.description||prefill)}</textarea></label><div class="form-grid">${fields.map(([name,label,type,required])=>`<label>${label}${required?' *':''}<input name="${name}" type="${type}" value="${esc(draft[name])}" ${required?'required':''} ${type==='number'?`min="${name==='quantity'?1:0}" step="${name==='quantity'?1:'0.01'}"`:''} ${type==='date'?`min="${new Date().toLocaleDateString('sv-SE')}"`:''} ${type==='text'?'maxlength="200"':''}></label>`).join('')}</div><label class="upload">Referencebilleder eller tegninger (valgfrit)<input id="special-files" type="file" multiple accept="image/png,image/jpeg,application/pdf"><span>Op til 3 filer · PNG, JPG eller PDF · maks. 5 MB pr. fil. Kun i denne fane.</span></label><p id="special-file-list" class="small">${references.map(f=>esc(f.name)).join(', ')}</p><p class="error" role="alert" id="special-error"></p><button type="submit" class="button">Gennemgå specialønske ↗</button></form><aside class="cart-summary"><h2>Fra idé til et konkret tilbud</h2><p>Muligheder, antal, pris og levering afklares, inden en specialproduktion kan bestilles.</p><p>Du godkender det endelige tilbud og design, før ordren går videre efter den aftalte proces.</p><p class="notice">Lokal demo: Din forespørgsel og dine filer bliver ikke sendt. Du kan gennemgå ønsket og hente en tekstkopi.</p><p class="small muted">Oplysningerne bevares kun i denne fane og forsvinder ved genindlæsning.</p></aside></div><div id="special-review" tabindex="-1"></div></section>`;}
export function bindSpecial(){
 const form=document.querySelector('#special-form');if(!form)return;
 const capture=()=>{draft=Object.fromEntries(new FormData(form));};
 form.addEventListener('input',capture);
 form.querySelector('#special-files').addEventListener('change',event=>{
  const files=[...event.target.files];const error=files.length>3?'Vælg højst 3 filer.':files.some(f=>f.size>5*1024*1024)?'Hver fil må højst fylde 5 MB.':files.some(f=>!['image/png','image/jpeg','application/pdf'].includes(f.type))?'Vælg PNG, JPG eller PDF.':'';
  document.querySelector('#special-error').textContent=error;
  if(error){event.target.value='';return;}
  references=files;document.querySelector('#special-file-list').textContent=files.map(f=>f.name).join(', ');
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();capture();
  const lines=[`Kundetype: ${{private:'Privatperson',business:'Virksomhed',association:'Forening'}[draft.customerType]}`,`Ønske: ${draft.description}`,...fields.filter(([name])=>draft[name]).map(([name,label])=>`${label}: ${draft[name]}`),`Vedhæftninger: ${references.map(f=>f.name).join(', ')||'Ingen'}`];
  const review=document.querySelector('#special-review');
  review.innerHTML=`<div class="review-complete"><p class="eyebrow">GENNEMGANG · IKKE SENDT</p><h2>Dit specialønske</h2><div class="special-summary"></div><p class="notice">Ingen forespørgsel er sendt. Tekstkopien indeholder filnavne, men ikke selve vedhæftningerne.</p><button type="button" id="special-download" class="button">Hent tekstkopi</button></div>`;
  const summary=review.querySelector('.special-summary');for(const line of lines){const p=document.createElement('p');p.textContent=line;summary.append(p);}
  review.querySelector('#special-download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['SMERCH — SPECIALPRODUKTION\nLOKAL DEMO · IKKE SENDT\n\n'+lines.join('\n\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='specialproduktion-demo.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  review.focus();review.scrollIntoView({behavior:'smooth',block:'start'});
 });
}
