import {launchConfig,countdown} from './launch-config.mjs';
if(!launchConfig.ordersEnabled){
 const banner=document.createElement('aside');
 banner.className='launch-banner';banner.setAttribute('aria-label','Webshoppen åbner snart');banner.setAttribute('translate','no');
 banner.innerHTML='<div class="launch-copy"><strong id="launch-title">Shoppen er live om</strong><span id="launch-note">Men du er velkommen til at kigge rundt :)</span></div><div class="launch-clock" role="timer" aria-live="off"></div>';
 const clock=banner.querySelector('.launch-clock');
 const units=['dage','timer','min','sek'];
 for(const unit of units){const cell=document.createElement('span');cell.innerHTML=`<b>00</b><small>${unit}</small>`;clock.append(cell);}
 document.body.prepend(banner);document.body.classList.add('launch-pending');
 const numbers=[...clock.querySelectorAll('b')],labels=[...clock.querySelectorAll('small')];
 const tick=()=>{
  const values=countdown(),english=document.documentElement.lang==='en',expired=values.every(value=>value===0);
  banner.querySelector('#launch-title').textContent=expired?(english?'We’re opening soon':'Vi åbner snart'):(english?'The shop goes live in':'Shoppen er live om');
  banner.querySelector('#launch-note').textContent=english?'But you’re welcome to have a look around :)':'Men du er velkommen til at kigge rundt :)';
  values.forEach((value,index)=>{const text=String(value).padStart(2,'0');if(numbers[index].textContent!==text)numbers[index].textContent=text;labels[index].textContent=(english?['days','hours','min','sec']:units)[index];});
 };
 new ResizeObserver(()=>document.documentElement.style.setProperty('--launch-height',`${banner.offsetHeight}px`)).observe(banner);
 tick();setInterval(tick,1000);
}
