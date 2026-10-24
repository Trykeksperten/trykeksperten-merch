// Move small product cards individually: never composite a screen-spanning image strip.
const running=new WeakMap();
export function bindContinuousRibbon(track,{win=window,doc=document}={}){
 if(running.has(track))return running.get(track);
 const group=track.querySelector('.brand-marquee-group');
 const cards=group?[...group.querySelectorAll('a')]:[];
 if(!cards.length)return;
 let width=0,offset=0,last=null,frame=null,disposed=false,pointer=null,velocity=0,suppressClick=false;
 const wrap=value=>{const span=width*cards.length;return span?((value%span)+span)%span:0;};
 const paint=()=>{
  const span=width*cards.length;if(!span)return;
  cards.forEach((card,i)=>{let x=((i*width-offset)%span+span)%span;if(x>span-width)x-=span;card.style.transform=`translateX(${x}px)`;});
 };
 const measure=()=>{
  const next=cards[0].getBoundingClientRect().width;
  if(next>0){offset=width?offset/width*next:0;width=next;track.style.height=`${Math.max(...cards.map(card=>card.getBoundingClientRect().height))}px`;paint();}
 };
 const down=e=>{if(e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;suppressClick=false;velocity=0;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,time:e.timeStamp,horizontal:false};};
 const move=e=>{
  if(!pointer||e.pointerId!==pointer.id)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(!pointer.horizontal){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;if(Math.abs(dy)>=Math.abs(dx)){pointer=null;return;}pointer.horizontal=true;track.setPointerCapture?.(e.pointerId);}
  const delta=e.clientX-pointer.lastX,elapsed=Math.max(16,e.timeStamp-pointer.time);
  offset=wrap(offset-delta);velocity=Math.max(-1.8,Math.min(1.8,-delta/elapsed));pointer.lastX=e.clientX;pointer.time=e.timeStamp;suppressClick=true;if(e.cancelable)e.preventDefault();paint();
 };
 const up=e=>{if(!pointer||e.pointerId!==pointer.id)return;if(e.type==='pointercancel'||e.timeStamp-pointer.time>100)velocity=0;pointer=null;};
 const reset=()=>{pointer=null;velocity=0;};
 const click=e=>{if(e.detail===0)return;if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false;}};
 const nativeDrag=e=>e.preventDefault();
 const stop=()=>{if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;};
 const tick=now=>{frame=null;if(!track.isConnected){dispose();return;}if(doc.hidden){last=null;return;}if(last!==null&&width>0){const elapsed=Math.min(Math.max(now-last,0),100);if(!pointer?.horizontal){offset=wrap(offset+elapsed*(width*cards.length/32000+velocity));velocity*=Math.exp(-elapsed/350);if(Math.abs(velocity)<.005)velocity=0;paint();}}last=now;frame=win.requestAnimationFrame(tick);};
 const resume=()=>{if(disposed)return;reset();stop();measure();if(!doc.hidden)frame=win.requestAnimationFrame(tick);};
 const observer=win.ResizeObserver?new win.ResizeObserver(measure):null;
 function dispose(){if(disposed)return;disposed=true;stop();observer?.disconnect();win.removeEventListener('resize',measure);win.removeEventListener('pageshow',resume);doc.removeEventListener('visibilitychange',resume);win.removeEventListener('pointerup',up);win.removeEventListener('pointercancel',up);win.removeEventListener('blur',reset);track.removeEventListener('pointerdown',down);track.removeEventListener('pointermove',move);track.removeEventListener('click',click,true);track.removeEventListener('dragstart',nativeDrag);running.delete(track);delete track.dataset.ribbonMotion;track.style.height='';cards.forEach(card=>card.style.transform='');}
 running.set(track,dispose);track.dataset.ribbonMotion='cards';track.style.transform='';track.addEventListener('pointerdown',down);track.addEventListener('pointermove',move,{passive:false});track.addEventListener('click',click,true);track.addEventListener('dragstart',nativeDrag);win.addEventListener('pointerup',up);win.addEventListener('pointercancel',up);win.addEventListener('blur',reset);observer?.observe(cards[0]);win.addEventListener('resize',measure);win.addEventListener('pageshow',resume);doc.addEventListener('visibilitychange',resume);resume();return dispose;
}
