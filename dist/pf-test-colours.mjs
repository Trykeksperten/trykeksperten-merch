import {artworkPantoneRows,nearestPantone} from './pantone-match.mjs';
// Proposals are separate from artwork: accepting one never recolours the file.
export function testColourProposal(design){
 const saved=Array.isArray(design.pmsColors)?design.pmsColors:[];
 if(saved.length===Number(design.colors)&&saved.every(code=>typeof code==='string'&&code.trim()))return {codes:saved.map(code=>code.trim()),source:'design'};
 const rows=(design.artworks||[]).flatMap(art=>artworkPantoneRows(art));
 if(design.text?.trim()){const text=nearestPantone(design.ink);if(text)rows.push(text);}
 const codes=[...new Set(rows.map(row=>row.code))];
 return {codes,source:rows.length&&rows.every(row=>row.status==='verified')?'file':'suggested'};
}
export function renderTestColourChoice(container,design,input){
 const proposal=testColourProposal(design);container.replaceChildren();
 input.value='';delete input.dataset.pendingConfirmation;
 const text=document.createElement('p');
 if(proposal.codes.length!==Number(design.colors)){
  text.textContent=proposal.codes.length?`Fundne farver: ${proposal.codes.join(', ')}. Antallet matcher ikke de ${design.colors} trykfarver. Afklar koderne i feltet nedenfor.`:'Ingen farvekode kunne aflæses. Angiv en afklaret PF-farvekode nedenfor.';
  container.append(text);return;
 }
 input.value=proposal.codes.join(', ');
 if(proposal.source==='design'){text.textContent=`Fra designet: ${input.value}`;container.append(text);return;}
 input.dataset.pendingConfirmation='1';
 text.textContent=`${proposal.source==='file'?'Aflæst fra originalfilen':'Nærmeste Pantone · forslag'}: ${input.value}`;
 const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Bekræft farvekoder';
 confirm.onclick=()=>{delete input.dataset.pendingConfirmation;confirm.disabled=true;confirm.textContent='Farvekoder bekræftet';};
 input.oninput=()=>{delete input.dataset.pendingConfirmation;confirm.disabled=true;confirm.textContent='Farvekoder rettet manuelt';};
 container.append(text,confirm);
}
