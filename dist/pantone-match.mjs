import {pantoneReferences} from './pantone-reference.mjs';
// D65 CIELAB distance on approximate sRGB references; suggestions never become
// verified original-file colours or supplier instructions.
function lab(hex){
 if(!/^#[0-9a-f]{6}$/i.test(hex||''))return null;
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
 const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
 return [116*y-16,500*(x-y),200*(y-z)];
}
const references=pantoneReferences.map(([code,hex])=>({code,hex,lab:lab(hex)}));
export function nearestPantone(hex){
 const target=lab(hex);if(!target)return null;
 let best=null,distance=Infinity;
 for(const row of references){const d=Math.hypot(...target.map((v,i)=>v-row.lab[i]));if(d<distance){distance=d;best=row;}}
 return best?{code:best.code,hex:best.hex,status:'suggested',distance}:null;
}
export function artworkPantoneRows(art){
 if(art.color||art.paletteColors?.length)return (art.paletteColors?.map(row=>row.target)||[art.color]).map(nearestPantone).filter(Boolean);
 if(art.logo?.pantone?.codes?.length)return art.logo.pantone.codes.map(code=>({code,status:art.logo.pantone.status==='verified'?'verified':'candidate',hex:references.find(row=>row.code===code)?.hex}));
 return (art.logo?.detectedPalette||[]).slice(0,12).map(row=>nearestPantone(row.hex)).filter(Boolean);
}
export function renderPantonePanel(note,artworks,{hidden=false}={}){
 let panel=note.parentElement.querySelector('[data-pantone-panel]');
 if(!panel){panel=document.createElement('section');panel.dataset.pantonePanel='';panel.className='pf-pantone-panel';panel.setAttribute('aria-label','Pantone-farver');note.after(panel);}
 panel.replaceChildren();panel.hidden=hidden||!artworks.length;if(panel.hidden)return;
 const title=document.createElement('strong');title.textContent='Pantone-farver';panel.append(title);
 for(const art of artworks){const rows=artworkPantoneRows(art),name=document.createElement('small');name.textContent=art.logo.name;panel.append(name);
  for(const row of rows){const line=document.createElement('div'),swatch=document.createElement('span'),label=document.createElement('span');swatch.className='pf-pantone-swatch';if(row.hex)swatch.style.backgroundColor=row.hex;else swatch.hidden=true;label.textContent=`${row.code} · ${row.status==='verified'?'Aflæst fra filen':row.status==='candidate'?'Farvenavn i filen':'Nærmeste Pantone (forslag)'}`;line.append(swatch,label);panel.append(line);}
  if(!rows.length){const msg=document.createElement('span');msg.textContent='Farven kunne ikke aflæses. Vi afklarer den i korrekturen.';panel.append(msg);}
 }
 const help=document.createElement('small');help.textContent='Farvematch er vejledende. Ved broderi matcher vi tråden; den endelige farve afklares i korrekturen.';panel.append(help);
}
