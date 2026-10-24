// Move small product cards individually: never composite a screen-spanning image strip.
const running=new WeakMap();
export function bindContinuousRibbon(track,{win=window,doc=document}={}){
 if(running.has(track))return running.get(track);
 const group=track.querySelector('.brand-marquee-group');
 const cards=group?[...group.querySelectorAll('a')]:[];
 if(!cards.length)return;
 let width=0,offset=0,last=null,frame=null,disposed=false;
 const paint=()=>{
  const span=width*cards.length;if(!span)return;
  cards.forEach((card,i)=>{let x=((i*width-offset)%span+span)%span;if(x>span-width)x-=span;card.style.transform=`translateX(${x}px)`;});
 };
 const measure=()=>{
  const next=cards[0].getBoundingClientRect().width;
  if(next>0){offset=width?offset/width*next:0;width=next;track.style.height=`${Math.max(...cards.map(card=>card.getBoundingClientRect().height))}px`;paint();}
 };
 const stop=()=>{if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;};
 const tick=now=>{frame=null;if(!track.isConnected){dispose();return;}if(doc.hidden){last=null;return;}if(last!==null&&width>0){const elapsed=Math.min(Math.max(now-last,0),100);offset=(offset+elapsed*width*cards.length/32000)%(width*cards.length);paint();}last=now;frame=win.requestAnimationFrame(tick);};
 const resume=()=>{if(disposed)return;stop();measure();if(!doc.hidden)frame=win.requestAnimationFrame(tick);};
 const observer=win.ResizeObserver?new win.ResizeObserver(measure):null;
 function dispose(){if(disposed)return;disposed=true;stop();observer?.disconnect();win.removeEventListener('resize',measure);win.removeEventListener('pageshow',resume);doc.removeEventListener('visibilitychange',resume);running.delete(track);delete track.dataset.ribbonMotion;track.style.height='';cards.forEach(card=>card.style.transform='');}
 running.set(track,dispose);track.dataset.ribbonMotion='cards';track.style.transform='';observer?.observe(cards[0]);win.addEventListener('resize',measure);win.addEventListener('pageshow',resume);doc.addEventListener('visibilitychange',resume);resume();return dispose;
}
