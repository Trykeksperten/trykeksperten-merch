// The external player is only created after an explicit visitor click.
const tracks = [
  {id:'Qt2mbGP6vFI', artist:'Phil Collins', title:'Another Day in Paradise'},
  {id:'KLVq0IAzh1A', artist:'Sting', title:'Fields of Gold'},
  {id:'C8QJmI_V3j4', artist:'Sade', title:'By Your Side'},
];
const nav = document.querySelector('#navigation');
if (nav) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'music-toggle';
  button.setAttribute('aria-controls','smerch-music');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('translate','no');
  const panel = document.createElement('section');
  panel.id = 'smerch-music';
  panel.className = 'music-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby','music-heading');
  panel.setAttribute('translate','no');
  panel.innerHTML = `<div class="music-heading"><h2 id="music-heading">Rolige toner</h2><button type="button" class="music-close">Stop og luk</button></div><p class="music-intro"></p><div class="music-player"></div><ol class="music-tracks">${tracks.map((t,i)=>`<li><button type="button" data-track="${i}"><span>${t.title}</span><small>${t.artist}</small></button></li>`).join('')}</ol><a class="music-external" target="_blank" rel="noopener">Åbn på YouTube</a>`;
  nav.append(button);
  document.body.append(panel);
  const close = panel.querySelector('.music-close');
  const english = () => document.documentElement.lang === 'en';
  let renderedLabels;
  function labels() {
    const state = `${english()}:${panel.hidden}`;
    if (state === renderedLabels) return;
    renderedLabels = state;
    button.textContent = panel.hidden ? (english()?'♫ Play music':'♫ Afspil musik') : (english()?'♫ Stop music':'♫ Stop musik');
    panel.querySelector('h2').textContent = english()?'Easy listening':'Rolige toner';
    close.textContent = english()?'Stop and close':'Stop og luk';
    panel.querySelector('.music-intro').textContent = english()?'A little music while you browse. Plays via YouTube.':'Lidt musik, mens du går på opdagelse. Afspilles via YouTube.';
    panel.querySelector('.music-external').textContent = english()?'Open playlist on YouTube':'Åbn listen på YouTube';
  }
  function play(index) {
    const queue = [...tracks.slice(index), ...tracks.slice(0,index)];
    const frame = document.createElement('iframe');
    const params = new URLSearchParams({autoplay:'1', playsinline:'1',rel:'0',playlist:queue.map(t=>t.id).join(',')});
    frame.src = `https://www.youtube-nocookie.com/embed/${queue[0].id}?${params}`;
    frame.title = `${queue[0].artist} – ${queue[0].title}`;
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    panel.querySelector('.music-player').replaceChildren(frame);
    panel.querySelector('.music-external').href = `https://www.youtube.com/watch_videos?video_ids=${queue.map(t=>t.id).join(',')}`;
  }
  function stop() {
    panel.querySelector('.music-player').replaceChildren();
    panel.hidden = true;
    button.setAttribute('aria-expanded','false');
    labels();
    button.focus();
  }
  button.addEventListener('click',()=>{
    if (!panel.hidden) return stop();
    panel.hidden = false;
    button.setAttribute('aria-expanded','true');
    labels();
    play(0);
    close.focus();
  });
  close.addEventListener('click',stop);
  panel.addEventListener('click',event=>{
    const track = event.target.closest('[data-track]');
    if(track) play(Number(track.dataset.track));
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !panel.hidden) stop();
  });
  new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  labels();
}
