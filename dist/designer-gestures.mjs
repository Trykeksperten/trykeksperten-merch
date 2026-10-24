// Gesture coordinates are relative to the print area, independent of preview size/zoom.
export function gesturePlacement(base,start,points,rect){
 const centre=ps=>({x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length});
 const a=centre(start),b=centre(points);
 const distance=ps=>Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);
 return {...base,x:base.x+(b.x-a.x)/Math.max(1,rect.width),y:base.y+(b.y-a.y)/Math.max(1,rect.height),scale:base.scale*(points.length===2&&start.length===2?distance(points)/Math.max(8,distance(start)):1)};
}
export function bindDesignerGestures(stage,{win=window,begin,read,rect,change,end}){
 const points=new Map();let base=null,start=[];
 const rebase=()=>{base={...read()};start=[...points.values()].slice(0,2).map(p=>({...p}));};
 const cleanup=()=>{win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);win.removeEventListener('pointercancel',cancel);win.removeEventListener('blur',cancel);};
 const finish=()=>{const active=points.size>0;points.clear();cleanup();base=null;start=[];if(active&&stage.isConnected)end();};
 const down=e=>{
  if((e.button!==undefined&&e.button!==0)||points.size>=2)return;
  if(!points.size){if(!begin(e))return;win.addEventListener('pointermove',move,{passive:false});win.addEventListener('pointerup',up);win.addEventListener('pointercancel',cancel);win.addEventListener('blur',cancel);}
  e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture?.(e.pointerId);rebase();
 };
 const move=e=>{if(!points.has(e.pointerId))return;if(!stage.isConnected){finish();return;}e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});const current=[...points.values()].slice(0,2);change(gesturePlacement(base,start,current,rect()),{points:current,start,base});};
 const up=e=>{if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(points.size)rebase();else{cleanup();base=null;start=[];if(stage.isConnected)end();}};
 const cancel=()=>finish();
 stage.addEventListener('pointerdown',down);
 return ()=>{finish();stage.removeEventListener('pointerdown',down);};
}
