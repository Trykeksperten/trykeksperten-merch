// Review saved placements without changing the editor's current working draft.
export function createDesignOverview({root,getItems,renderMockup,onEdit,onContinue}){
 const dialog=document.createElement('dialog');
 dialog.className='pf-design-overview';
 dialog.setAttribute('aria-labelledby','pf-overview-title');
 dialog.innerHTML='<header><h2 id="pf-overview-title">Se hele dit design</h2><button type="button" data-close aria-label="Luk designoversigt">×</button></header><nav aria-label="Trykplaceringer"></nav><div class="pf-overview-image" aria-live="polite"></div><p class="pf-overview-status"></p><div class="pf-overview-paging"><button type="button" data-prev aria-label="Forrige placering">←</button><span></span><button type="button" data-next aria-label="Næste placering">→</button></div><footer><button type="button" class="button light" data-edit>Ret placering</button><button type="button" class="button" data-continue>Fortsæt →</button></footer>';
 root.append(dialog);
 const find=s=>dialog.querySelector(s),stage=find('.pf-overview-image'),status=find('.pf-overview-status');
 let items=[],index=0,version=0;
 const close=()=>{version++;dialog.close();};
 async function show(next){
  index=next;const token=++version,item=items[index];
  find('nav').replaceChildren(...items.map((entry,i)=>{const button=document.createElement('button');button.type='button';button.textContent=entry.option.impLocation;button.setAttribute('aria-pressed',String(i===index));button.onclick=()=>show(i);return button;}));
  find('[data-prev]').disabled=index===0;find('[data-next]').disabled=index===items.length-1;
  find('.pf-overview-paging span').textContent=`${index+1} af ${items.length}`;
  find('[data-edit]').textContent=item.ready?'Ret placering':'Færdiggør placering';
  find('[data-continue]').disabled=!items.every(entry=>entry.ready);
  status.textContent=item.ready?'Gemt design · forhåndsvisning':'Placeringen mangler et gemt design.';
  stage.textContent=item.ready?'Indlæser mockup…':'Åbn placeringen for at færdiggøre og gemme dit design.';
  if(!item.ready)return;
  try{const canvas=await renderMockup(item);if(token!==version||!dialog.open)return;const image=document.createElement('img');image.src=canvas.toDataURL('image/png');image.alt=`Dit design · ${item.option.impLocation}`;stage.replaceChildren(image);}
  catch{if(token===version&&dialog.open){stage.textContent='Mockuppet kunne ikke indlæses.';const retry=document.createElement('button');retry.type='button';retry.className='button light';retry.textContent='Prøv igen';retry.onclick=()=>show(index);stage.append(retry);}}
 }
 find('[data-close]').onclick=close;
 find('[data-prev]').onclick=()=>show(Math.max(0,index-1));
 find('[data-next]').onclick=()=>show(Math.min(items.length-1,index+1));
 find('[data-edit]').onclick=()=>{const selected=index;close();onEdit(selected);};
 find('[data-continue]').onclick=()=>{close();onContinue();};
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();show(Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowRight'?1:-1))));}});
 dialog.addEventListener('close',()=>{version++;});
 return {open(){items=getItems();if(!items.length)return;if(!dialog.open)dialog.showModal();show(0);}};
}
