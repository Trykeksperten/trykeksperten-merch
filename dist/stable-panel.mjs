// Keep the current panel footprint while a newer price is being fetched.
// Replace old prices with a message so they cannot be mistaken for the new variant's prices.
export function renderStablePanel(node,html,{pending=false}={}){
 if(pending&&node.getAttribute('aria-busy')!=='true'){
  const height=node.offsetHeight;
  if(height>0)node.style.minHeight=`${height}px`;
 }
 node.innerHTML=html;
 node.setAttribute('aria-busy',String(pending));
 if(!pending)node.style.removeProperty('min-height');
}
