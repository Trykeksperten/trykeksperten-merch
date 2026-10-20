import {readCart} from './pf-cart.mjs';
import {loadFile} from './storage.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const result=document.createElement(tag);if(text)result.textContent=text;return result;};
export function bindCartTest(){
 let snapshot=null,requestId=null;
 const preview=$('test-cart-preview'),panel=$('test-cart-panel');
 const load=()=>{
  snapshot=structuredClone(readCart());requestId=crypto.randomUUID();preview.replaceChildren();
  if(!snapshot.length){preview.append(node('p','Kurven er tom. Tilføj et produkt med logo på shoppen.'));return;}
  preview.append(node('p',`${snapshot.length} varelinjer · ${snapshot.reduce((sum,line)=>sum+Number(line.quantity),0)} stk. Kurven bliver ikke tømt ved test.`));
  snapshot.forEach((line,i)=>{
   const section=node('section');section.append(node('h3',`${line.quantity} × ${line.sku}`));
   if(!line.decorations?.length)section.append(node('p','Uden tryk — fjern denne vare fra kurven før logotesten.'));
   (line.decorations||[]).forEach((decoration,j)=>{
    section.append(node('p',`${decoration.position} · ${decoration.method} · ${decoration.width} × ${decoration.height} mm`));
    section.append(node('p',(decoration.artworks||[]).map(art=>art.logo.name).join(', ')||'Tekst uden logofil'));
    const label=node('label',`PF-farvekoder (${decoration.colors} farve${decoration.colors===1?'':'r'}, adskilt med komma)`),input=node('input');input.dataset.testColour=`${i}:${j}`;input.placeholder='Fx Black C';input.required=true;label.append(input);section.append(label);
   });preview.append(section);
  });
 };
 $('test-source').onchange=()=>{panel.hidden=$('test-source').value!=='cart';if(!panel.hidden&&!snapshot)load();for(const input of preview.querySelectorAll('input'))input.disabled=panel.hidden;};
 $('test-load-cart').onclick=load;
 return {async payload(shipping){
  if(!snapshot?.length)throw Error('Indlæs en kurv med logoer først.');
  if(JSON.stringify(snapshot)!==JSON.stringify(readCart()))throw Error('Kurven er ændret. Tryk Indlæs min kurv og kontrollér den igen.');
  const colours={};for(const input of preview.querySelectorAll('input[data-test-colour]'))colours[input.dataset.testColour]=input.value.split(',').map(value=>value.trim()).filter(Boolean);
  const ids=[...new Set(snapshot.flatMap(line=>(line.decorations||[]).flatMap(deco=>(deco.artworks||[]).map(art=>art.logo.id))))],artworks=[];let total=0;
  for(const id of ids){const blob=await loadFile(id);if(!blob)throw Error('En originalfil mangler i browseren. Åbn designet og upload filen igen.');total+=blob.size;if(total>20*1024*1024)throw Error('Originalfilerne må samlet højst fylde 20 MB.');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));artworks.push({id,base64:btoa(binary)});}
  return {requestId,confirmation:'TEST',lines:snapshot,shipping,colours,artworks};
 }};
}
