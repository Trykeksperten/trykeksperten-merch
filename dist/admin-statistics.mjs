const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const number=value=>(value||0).toLocaleString('da-DK');
const labels={home:'Forside',products:'Produktoversigt',product:'Produktsider',cart:'Kurv',checkout:'Betaling',about:'Om smerch',contact:'Kontakt',brands:'Brands',special:'Specialproduktion'};
export async function renderStatistics(parent,api){
 const host=el('section'),controls=el('label','Periode '),select=el('select'),body=el('div');
 for(const [value,title]of [[1,'I dag'],[7,'Seneste 7 dage'],[30,'Seneste 30 dage'],[90,'Seneste 90 dage']]){const option=el('option',title);option.value=value;select.append(option);}select.value='7';controls.className='statistics-period';controls.append(select);host.append(controls,body);parent.replaceChildren(host);
 let version=0;
 async function draw(){const current=++version;body.textContent='Indlæser statistik…';try{
  const data=await(await api(`/api/admin/statistics?days=${select.value}`)).json();if(current!==version||!host.isConnected)return;body.replaceChildren();
  const {events,units,pages}=data.totals;
  body.append(el('p',`${data.from} – ${data.to} · Dansk tid. ${data.startedAt?'Registrering startet '+new Date(data.startedAt).toLocaleString('da-DK')+'.':'Der er endnu ikke registreret aktivitet.'}`,'intro'));
  const metrics=el('div',undefined,'metrics');
  for(const [value,label,note]of [[events.page_view,'Sidevisninger','Ikke unikke besøgende'],[events.cart_add,'Tilføjelser til kurv',`${number(units.cart_add)} stk. tilføjet`],[events.cart_remove,'Fjernelser fra kurv',`${number(units.cart_remove)} stk. fjernet`],[events.cart_empty,'Kurve tømt','Sidste vare fjernet af kunden'],[pages.cart,'Visninger af kurven','Inkluderer gentagne besøg'],[pages.checkout,'Visninger af betaling','Ikke gennemførte køb']]){const card=el('div',undefined,'metric');card.append(el('strong',number(value)),el('span',label),el('small',note));metrics.append(card);}body.append(metrics);
  const chart=(title,rows)=>{const panel=el('section',undefined,'panel');panel.append(el('h2',title));const max=Math.max(1,...rows.map(row=>row.value));const list=el('div',undefined,'statistics-chart');for(const row of rows){const item=el('div',undefined,'statistics-bar'),meter=el('meter');meter.min=0;meter.max=max;meter.value=row.value;meter.setAttribute('aria-label',`${row.label}: ${row.value} sidevisninger`);item.append(el('span',row.label),meter,el('strong',number(row.value)));list.append(item);}panel.append(list);return panel;};
  const grid=el('div',undefined,'grid');grid.append(chart('Sidevisninger pr. dag',data.daily.map(row=>({label:row.date,value:row.views}))),chart('Tidspunkt på dagen',data.hourly.map(row=>({label:`${String(row.hour).padStart(2,'0')}:00–${String(row.hour).padStart(2,'0')}:59`,value:row.views}))));body.append(grid);
  body.append(chart('Hvilke sider bliver set?',Object.entries(pages).sort((a,b)=>b[1]-a[1]).map(([page,value])=>({label:labels[page]||page,value}))));
  const detail=el('details',undefined,'panel');detail.append(el('summary','Sådan læses tallene'));detail.append(el('p','Tallene er samlede hændelser, ikke personer eller unikke kurve. En tilføjelse kan omfatte flere størrelser. Ændring af antal tæller som tilføjede eller fjernede stk. Automatisk tømning efter betaling tæller ikke som en tømt kurv.'));
  detail.append(el('p','En forladt kurv kan ikke udledes af disse tællinger: kunden kan vende tilbage senere. Sidevisninger på betalingssiden er ikke køb eller en konverteringsrate. Se faktiske betalinger under Ordrer.'));
  detail.append(el('p','Kun summer pr. time gemmes, i op til 90 dage. Ingen besøgs-id’er, IP-adresser, søgetekster eller kundedata gemmes i statistikken. Administratorbesøg filtreres fra, når du er logget ind. Browserblokering og automatiseret trafik kan påvirke tallene.'));body.append(detail);
 }catch(error){if(current===version&&host.isConnected)body.textContent=error.message;}}
 select.onchange=draw;await draw();
}
