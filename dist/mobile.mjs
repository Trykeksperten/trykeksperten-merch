const mobile=matchMedia('(max-width: 1024px)'),nav=document.getElementById('navigation'),header=nav.closest('header'),toggle=document.querySelector('.menu-toggle');
const panels=['product','brands'].map(name=>({panel:document.getElementById(`${name}-menu`),button:document.getElementById(`${name}-menu-toggle`)}));
const heading=document.createElement('div');heading.className='mobile-menu-heading';heading.innerHTML='<strong>Menu</strong><button type="button" aria-label="Luk menu">Luk ×</button>';nav.prepend(heading);
const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.focus();};heading.querySelector('button').onclick=close;
function sync(){for(const {panel,button}of panels){panel.hidden=true;button.setAttribute('aria-expanded','false');if(mobile.matches)button.after(panel);else header.append(panel);}if(!mobile.matches){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');}layout();}
function layout(){const open=mobile.matches&&nav.classList.contains('open');document.body.classList.toggle('mobile-nav-open',open);document.querySelector('main').inert=open;document.querySelector('.site-footer').inert=open;}
new MutationObserver(layout).observe(nav,{attributes:true,attributeFilter:['class']});
mobile.addEventListener('change',sync);
document.addEventListener('keydown',event=>{if(!mobile.matches||!nav.classList.contains('open'))return;if(event.key==='Escape'){close();return;}if(event.key==='Tab'){const items=[...nav.querySelectorAll('a,button')].filter(el=>el.getClientRects().length&&!el.disabled),first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||!nav.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!nav.contains(document.activeElement))){event.preventDefault();first?.focus();}}});
sync();

// Keep the editor inside the visible area when the phone keyboard opens.
function syncViewport(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--editor-height',`${viewport?.height||window.innerHeight}px`);document.documentElement.style.setProperty('--editor-top',`${viewport?.offsetTop||0}px`);}
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);window.addEventListener('resize',syncViewport);syncViewport();
