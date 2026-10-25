// A text-field submit or a click retargeted during keyboard movement must not save a design.
export function previewScrollTarget(frame,zone,scroll){
 const clamp=(value,max)=>Math.min(Math.max(0,max),Math.max(0,value));
 return {left:clamp(scroll.left+zone.left+zone.width/2-frame.left-frame.width/2,scroll.width-frame.width),top:clamp(scroll.top+zone.top+zone.height/2-frame.top-frame.height/2,scroll.height-frame.height)};
}
export function bindExplicitDesignSave(form,button,save){
 let press=null;
 const down=e=>{press=e.button===undefined||e.button===0?{x:e.clientX,y:e.clientY,time:e.timeStamp}:null;};
 const cancel=()=>{press=null;};
 const click=e=>{e.preventDefault();const start=press;press=null;const direct=e.detail===0||(start&&e.timeStamp-start.time>=0&&e.timeStamp-start.time<3000&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<20);if(direct)save();};
 const submit=e=>{e.preventDefault();};
 button.type='button';button.addEventListener('pointerdown',down);button.addEventListener('pointercancel',cancel);button.addEventListener('click',click);form.addEventListener('submit',submit);
 return ()=>{button.removeEventListener('pointerdown',down);button.removeEventListener('pointercancel',cancel);button.removeEventListener('click',click);form.removeEventListener('submit',submit);};
}
export function bindDesignerKeyboard(designer,{doc=document,win=window}={}){
 const viewport=win.visualViewport,media=win.matchMedia('(max-width:1024px)');
 const height=()=>viewport?.height||win.innerHeight;
 let baseline=height(),field=null,seenKeyboard=false,dismissed=false;
 const editable=node=>node&&designer.contains(node)&&(node.tagName==='TEXTAREA'||(node.tagName==='INPUT'&&['text','number','email','search','tel','url','password'].includes(node.type)));
 const reveal=()=>win.requestAnimationFrame(()=>{if(!field||!designer.isConnected)return;const pane=designer.querySelector('.pf-designer-sidebar');if(!pane)return;const box=field.getBoundingClientRect(),area=pane.getBoundingClientRect();if(box.bottom>area.bottom-12)pane.scrollTop+=box.bottom-area.bottom+12;if(box.top<area.top+12)pane.scrollTop+=box.top-area.top-12;});
 const sync=()=>{if(!designer.isConnected){dispose();return;}const active=media.matches&&editable(doc.activeElement);if(!active){field=null;seenKeyboard=false;dismissed=false;baseline=height();designer.classList.remove('pf-keyboard-editing');return;}field=doc.activeElement;const reduced=baseline-height()>120;if(reduced){seenKeyboard=true;dismissed=false;}else if(seenKeyboard){dismissed=true;seenKeyboard=false;}const typing=!dismissed;designer.classList.toggle('pf-keyboard-editing',typing);if(typing)reveal();};
 const focus=()=>{if(!editable(doc.activeElement))return;dismissed=false;seenKeyboard=false;field=doc.activeElement;sync();};
 const blur=()=>win.queueMicrotask(sync);
 const resize=()=>{if(!editable(doc.activeElement))baseline=height();sync();};
 const dispose=()=>{designer.removeEventListener('focusin',focus);designer.removeEventListener('focusout',blur);viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',sync);win.removeEventListener('resize',resize);media.removeEventListener('change',sync);designer.classList.remove('pf-keyboard-editing');};
 designer.addEventListener('focusin',focus);designer.addEventListener('focusout',blur);viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',sync);win.addEventListener('resize',resize);media.addEventListener('change',sync);
 return dispose;
}
export function bindMobileDesignerControls(designer,{doc=document,win=window}={}){
 const tabs=designer.querySelector('.pf-editor-tabs'),zoom=designer.querySelector('.pf-editor-zoom'),tools=designer.querySelector('.pf-designer-sidebar');
 const tabsHome=doc.createComment('editor-tabs'),zoomHome=doc.createComment('editor-zoom'),dock=doc.createElement('div');dock.className='pf-mobile-tools';tabs.before(tabsHome);zoom.before(zoomHome);tools.prepend(dock);
 const info=doc.createElement('div');info.className='pf-desktop-design-info';const metadata=['#pf-editor-unit-price','#pf-art-quality-badge'].map(selector=>{const node=designer.querySelector(selector),home=doc.createComment('editor-info');node.before(home);return {node,home};});tools.prepend(info);
 const media=win.matchMedia('(max-width:1024px)');
 const sync=()=>{if(!designer.isConnected){media.removeEventListener('change',sync);return;}if(media.matches){dock.append(tabs,zoom);for(const {node,home} of metadata)home.after(node);}else{tabsHome.after(tabs);zoomHome.after(zoom);for(const {node} of metadata)info.append(node);}info.hidden=media.matches;dock.hidden=!media.matches;const leave=designer.querySelector('.pf-editor-leave');if(leave){leave.textContent=media.matches?'Luk':'Forlad designstudiet';leave.setAttribute('aria-label','Luk designstudiet');}};
 const disposeKeyboard=bindDesignerKeyboard(designer,{doc,win});
 media.addEventListener('change',sync);sync();return ()=>{media.removeEventListener('change',sync);disposeKeyboard();};
}
