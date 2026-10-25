// A text-field submit or a click retargeted during keyboard movement must not save a design.
export function bindExplicitDesignSave(form,button,save){
 let press=null;
 const down=e=>{press=e.button===undefined||e.button===0?{x:e.clientX,y:e.clientY,time:e.timeStamp}:null;};
 const cancel=()=>{press=null;};
 const click=e=>{e.preventDefault();const start=press;press=null;const direct=e.detail===0||(start&&e.timeStamp-start.time>=0&&e.timeStamp-start.time<3000&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<20);if(direct)save();};
 const submit=e=>{e.preventDefault();};
 button.type='button';button.addEventListener('pointerdown',down);button.addEventListener('pointercancel',cancel);button.addEventListener('click',click);form.addEventListener('submit',submit);
 return ()=>{button.removeEventListener('pointerdown',down);button.removeEventListener('pointercancel',cancel);button.removeEventListener('click',click);form.removeEventListener('submit',submit);};
}
export function bindMobileDesignerControls(designer,{doc=document,win=window}={}){
 const tabs=designer.querySelector('.pf-editor-tabs'),zoom=designer.querySelector('.pf-editor-zoom'),tools=designer.querySelector('.pf-designer-sidebar');
 const tabsHome=doc.createComment('editor-tabs'),zoomHome=doc.createComment('editor-zoom'),dock=doc.createElement('div');dock.className='pf-mobile-tools';tabs.before(tabsHome);zoom.before(zoomHome);tools.prepend(dock);
 const info=doc.createElement('div');info.className='pf-desktop-design-info';const metadata=['#pf-editor-unit-price','#pf-art-quality-badge'].map(selector=>{const node=designer.querySelector(selector),home=doc.createComment('editor-info');node.before(home);return {node,home};});tools.prepend(info);
 const media=win.matchMedia('(max-width:1024px)');
 const sync=()=>{if(!designer.isConnected){media.removeEventListener('change',sync);return;}if(media.matches){dock.append(tabs,zoom);for(const {node,home} of metadata)home.after(node);}else{tabsHome.after(tabs);zoomHome.after(zoom);for(const {node} of metadata)info.append(node);}info.hidden=media.matches;dock.hidden=!media.matches;const leave=designer.querySelector('.pf-editor-leave');if(leave){leave.textContent=media.matches?'Luk':'Forlad designstudiet';leave.setAttribute('aria-label','Luk designstudiet');}};
 media.addEventListener('change',sync);sync();return ()=>media.removeEventListener('change',sync);
}
