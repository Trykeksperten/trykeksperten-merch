const base='/api/admin/accounting';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const money=new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'});
const amount=value=>Number.isSafeInteger(value)?money.format(value/100):'—';
const url=(suffix,params)=>base+suffix+'?'+new URLSearchParams(params);
const link=(label,href)=>{const a=el('a',label);a.href=href;return a;};
function downloadLink(label,href,accessibleLabel=label){
 const a=link(label,href);
 a.className='accounting-download';
 a.download='';
 a.setAttribute('aria-label',accessibleLabel);
 const icon=el('span','↓');
 icon.setAttribute('aria-hidden','true');
 a.prepend(icon);
 return a;
}
function reportDownloads(title,hrefFor,extra=[]){
 const links=el('div');
 links.className='accounting-downloads';
 for(const format of ['CSV','PDF',...extra]){
  links.append(downloadLink('Hent '+format,hrefFor(format.toLowerCase()),'Hent '+title+' som '+format));
 }
 return links;
}
function reportHeading(title,downloads,level='h2'){
 const heading=el('div');
 heading.className='accounting-report-heading';
 heading.append(el(level,title),downloads);
 return heading;
}
const types={
 settlement:'Clearhaus-afregning',sale:'Afsendt salg',credit:'Kreditnota',replacement:'Erstatningsfaktura',capture:'Hævning',
 refund:'Refundering',bank_payment:'Bankbetaling',invoice:'Faktura',accountant_invoice_request:'Fakturaanmodning',
 payment_receipt:'Betalingskvittering',accountant_payment_receipt:'Bogholderkvittering',
 accountant_basis:'Fakturagrundlag',refund_basis:'Refunderingsgrundlag'
};
const issues={
 conflicting_source:'Samme transaktionsreference har forskellige oplysninger.',
 missing_order:'Ordren bag regnskabsposten kunne ikke findes.',
 invalid_sale:'Afsendelsens beløb eller reference kunne ikke valideres.',
 invalid_correction:'Kreditnota eller korrektion mangler et gyldigt grundlag.',
 invalid_payment:'Betalingens beløb eller reference kunne ikke valideres.',
 payment_date_missing:'En verificeret betaling mangler betalingsdato.',
 payment_mode_unverified:'Det kan ikke bekræftes, at betalingen er fra drift.',
 invalid_settlement:'Afregningens beløb eller referencer kunne ikke valideres.',
 settlement_date_missing:'En historisk afregning mangler udbetalingsdato og indgår ikke i rapportens summer.',
 invalid_sale_date:'En afsendelse mangler en gyldig afsendelsesdato.',
 invalid_document_date:'Et bogført bilag mangler en gyldig bilagsdato.'
};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel=date=>date.split('-').reverse().join('.');
let selected={mode:'month'};
function dateControl(title,type,value){
 const input=el('input'),label=el('label',title);
 input.type=type;input.value=value;input.required=true;
 input.pattern=type==='month'?'20[0-9]{2}-(0[1-9]|1[0-2])':'20[0-9]{2}-[0-9]{2}-[0-9]{2}';
 if(type==='date'){input.min='2000-01-01';input.max='2099-12-31';}
 label.append(input);return {input,label};
}
function panel(title,description,downloads){
 const node=el('section');node.className='panel';
 node.append(downloads?reportHeading(title,downloads):el('h2',title));
 if(description)node.append(el('p',description));
 return node;
}
function pagedRows(rows,render,{label='poster',searchText}={}){
 const section=el('div'),list=el('div'),controls=el('div'),count=el('span');
 controls.className='accounting-pagination';
 count.setAttribute('role','status');
 const previous=el('button','Forrige'),next=el('button','Næste');
 previous.type=next.type='button';
 controls.append(previous,count,next);
 const pageSize=25;
 let page=1,filtered=rows;
 function update(){
  const start=(page-1)*pageSize;
  list.replaceChildren(render(filtered.slice(start,start+pageSize)));
  count.textContent=filtered.length?(`${start+1}–${Math.min(start+pageSize,filtered.length)} af ${filtered.length} ${label}`):`Ingen ${label}`;
  previous.disabled=page===1;
  next.disabled=start+pageSize>=filtered.length;
 }
 if(searchText){
  const search=el('input'),searchLabel=el('label','Søg på ordrenummer eller reference');
  search.type='search';search.maxLength=200;searchLabel.className='accounting-search';
  searchLabel.append(search);section.append(searchLabel);
  const indexed=rows.map(row=>({row,text:searchText(row).toLocaleLowerCase('da-DK')}));
  search.oninput=()=>{
   const query=search.value.trim().toLocaleLowerCase('da-DK');
   filtered=indexed.filter(item=>item.text.includes(query)).map(item=>item.row);
   page=1;update();
  };
 }
 previous.onclick=()=>{page--;update();if(previous.disabled)next.focus();};
 next.onclick=()=>{page++;update();if(next.disabled)previous.focus();};
 section.append(list,controls);update();
 return section;
}
function table(headers,rows,paginate=true){
 if(paginate&&rows.length>25)return pagedRows(rows,page=>table(headers,page,false));
 if(!rows.length)return el('p','Ingen registreringer i denne visning.');
 const wrapper=el('div');wrapper.className='accounting-table';
 const t=el('table'),head=t.createTHead().insertRow();
 for(const title of headers){const th=el('th',title);th.scope='col';head.append(th);}
 const body=t.createTBody();
 for(const row of rows){const tr=body.insertRow();for(const value of row){const cell=tr.insertCell();if(value instanceof Node)cell.append(value);else cell.textContent=value??'—';}}
 wrapper.append(t);return wrapper;
}

function documentRows(rows){
 const basesByOrder=new Map();
 const documents=rows.filter(row=>row.kind==='document');
 for(const row of documents){
  if(!['accountant_basis','accountant_invoice_request'].includes(row.type))continue;
  const versions=basesByOrder.get(row.orderId)??[];
  versions.unshift(row); // The report lists documents in ascending date order.
  basesByOrder.set(row.orderId,versions);
 }
 const download=row=>downloadLink('Hent '+row.format.toUpperCase(),
  url('/document',{order:row.orderId,id:row.id,digest:row.digest}),
  'Hent '+(types[row.type]||row.type)+' for ordre '+row.orderNumber+' som '+row.format.toUpperCase());
 return documents.flatMap(row=>{
  const versions=basesByOrder.get(row.orderId);
  if(versions?.includes(row)&&versions.length>1){
   if(row!==versions[0])return [];
   const files=el('div'),history=el('details'),list=el('ul');
   files.className='accounting-document-files';
   history.append(el('summary',`Vis tidligere grundlag (${versions.length-1})`),list);
   for(const version of versions.slice(1)){
    const item=el('li',version.date+' · ');
    item.append(download(version));list.append(item);
   }
   files.append(download(row),history);
   return [[row.date,row.orderNumber,'Fakturagrundlag',row.reference,files]];
  }
  return [[row.date,row.orderNumber,types[row.type]||row.type,row.reference,download(row)]];
 });
}

function orderLookup(rows){
 const section=panel('Ordreopslag','Find regnskabsposter og bilag for en ordre i den viste periode.');
 const orders=new Map();
 for(const row of rows.slice().reverse()){
  if(!orders.has(row.orderId))orders.set(row.orderId,{number:row.orderNumber,id:row.orderId,date:row.date,entries:[]});
  orders.get(row.orderId).entries.push(row);
 }
 function renderOrders(page){
  if(!page.length)return el('p','Ingen ordrer fundet i denne visning.');
  const list=el('div');list.className='accounting-order-list';
  for(const order of page){
   const details=el('details'),summary=el('summary');
   summary.append(el('strong','Ordre '+order.number),el('span','Seneste post '+dateLabel(order.date)));
   details.append(summary);
   details.addEventListener('toggle',()=>{
    if(!details.open||details.childElementCount>1)return;
    const entries=order.entries.filter(row=>row.kind!=='document');
    if(entries.length)details.append(table(['Dato','Type','Reference','Beløb'],entries.map(row=>[
     row.date,types[row.kind]||row.kind,row.quickpayReference||row.invoiceReference||row.settlementReference||row.bankReference,
     amount(row.kind==='settlement'?row.amounts?.bank:row.amounts?.gross)
    ])));
    const documents=documentRows(order.entries.slice().reverse());
    if(documents.length)details.append(el('h3','Bilag og kvitteringer'),table(['Dato','Ordrenummer','Type','Reference','Bilag'],documents));
   });
   list.append(details);
  }
  return list;
 }
 section.append(pagedRows([...orders.values()],renderOrders,{label:'ordrer',searchText:order=>[
  order.number,order.id,...order.entries.flatMap(row=>[
   row.reference,row.quickpayReference,row.invoiceReference,row.bankReference,row.settlementReference,row.paymentId
  ])
 ].join(' ')}));
 return section;
}

export function renderAccounting(container,api){
 const root=el('div');root.className='accounting-view';container.append(root);
 const filter=el('form'),mode=el('select'),modeLabel=el('label','Visning'),show=el('button','Vis rapport'),status=el('p'),results=el('div');
 for(const [value,title] of [['day','Dag'],['month','Måned'],['year','År'],['range','Brugerdefineret']]){
  const option=el('option',title);option.value=value;mode.append(option);
 }
 mode.value=selected.mode;modeLabel.append(mode);
 const now=today();
 const period=dateControl('Måned','month',selected.period||now.slice(0,7));
 const day=dateControl('Dato','date',selected.day||now);
 const year=dateControl('År','text',selected.year||now.slice(0,4));
 year.input.pattern='20[0-9]{2}';year.input.inputMode='numeric';year.input.maxLength=4;
 const from=dateControl('Fra dato','date',selected.from||'');
 const to=dateControl('Til dato','date',selected.to||'');
 function showControls(){
  const isRange=mode.value==='range';
  for(const [control,visible] of [[day,mode.value==='day'],[period,mode.value==='month'],[year,mode.value==='year'],[from,isRange],[to,isRange]]){
   control.label.hidden=!visible;control.input.disabled=!visible;
  }
  if(isRange&&!from.input.value&&!to.input.value){
   const key=period.input.value||now.slice(0,7),[year,month]=key.split('-').map(Number);
   from.input.value=key+'-01';
   to.input.value=key===now.slice(0,7)?now:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  }
 }
 mode.onchange=showControls;showControls();
 filter.className='accounting-period';show.type='submit';filter.append(modeLabel,day.label,period.label,year.label,from.label,to.label,show);
 status.className='accounting-status';status.setAttribute('role','status');root.append(filter,status,results);
 let request=0;
 async function load(){
  const id=++request,currentMode=mode.value;
  let params;
  switch(currentMode){
   case 'day': params={from:day.input.value,to:day.input.value};break;
   case 'year': params={from:year.input.value+'-01-01',to:year.input.value+'-12-31'};break;
   case 'range': params={from:from.input.value,to:to.input.value};break;
   default: params={period:period.input.value};
  }
  status.textContent='Indlæser regnskabsdata…';results.replaceChildren();
  try{
   const data=await(await api(url('',params))).json();
   if(id!==request||!root.isConnected)return;
   selected={mode:currentMode,day:day.input.value,year:year.input.value,period:period.input.value,from:from.input.value,to:to.input.value};
   status.textContent='';draw(data,params,currentMode);
  }catch(error){if(id===request)status.textContent=error.message;}
 }
 function draw(data,params,currentMode){
  const {report,versions,periodStatus,canReconcile,integration}=data,{totals:t,rows}=report;
  const key=report.period;
  const downloads=(title,section,extra=[])=>reportDownloads(title,format=>
   format==='json'?url('/export',params):url('/report-export',{...params,report:section,format}),extra);
  const issueDownloads=report.issues.length?downloads('afvigelser i datakontrol','datakontrol'):undefined;
  const scopeLabel=currentMode==='year'?report.from.slice(0,4):currentMode==='day'?dateLabel(report.from):key?new Intl.DateTimeFormat('da-DK',{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(key+'-01T00:00:00Z')):dateLabel(report.from)+' – '+dateLabel(report.to);
  const salesDownloads=reportDownloads('omsætningsrapport',format=>url(format==='pdf'?'/sales-export.pdf':'/sales-export',params));
  salesDownloads.firstElementChild.textContent='Hent CSV til Excel';
  const overview=panel('Omsætning',scopeLabel+' · DKK',salesDownloads);
  const metrics=el('dl');metrics.className='accounting-metrics accounting-sales-metrics';
  for(const [label,value] of [
   ['Omsætning ekskl. moms',t.salesNet],['Moms i alt',t.salesVAT],['Omsætning inkl. moms',t.salesGross]
  ]){const metric=el('div');metric.append(el('dt',label),el('dd',amount(value)));metrics.append(metric);}
  overview.append(metrics,el('p','Omsætningen omfatter dokumenterede afsendelser og registrerede korrektioner.'));
  const advanced=el('details'),reports=el('div');
  advanced.className='accounting-more';
  advanced.append(el('summary','Flere rapporter og afstemning'),reports);
  results.append(overview,orderLookup(rows),advanced);
  if(integration){
   const accounts=panel('Bogholderlogin');
   if(data.accountantAccountsEnabled){
    accounts.append(link('Administrér bogholderlogin','/backoffice.html#users'));
   }else{
    accounts.append(el('p','Bogholderlogin kræver, at medarbejderportalen aktiveres med SQLite.'));
   }
   results.append(accounts);
  }
  advanced.addEventListener('toggle',()=>{
   if(advanced.open&&!reports.hasChildNodes())drawReports();
  });
  function drawReports(){
   const financialOverview=panel('Betalinger og udbetalinger',undefined,downloads('regnskabsoverblik','overblik',['JSON']));
   financialOverview.append(table(['Post','Beløb'],[
    ['Hævet via Quickpay',t.captured],['Refunderinger via Quickpay',t.refunded],['Registrerede bankbetalinger',t.bankPayments],
    ['Registrerede afregningsgebyrer',t.fees],['Registrerede bankudbetalinger',t.payouts]
   ].map(([label,value])=>[label,amount(value)])));
   const sales=panel('Omsætningsrapport','Rapporten viser dokumenterede afsendelser og registrerede korrektioner. Brug den sammen med bilagene ved bogføringen.',
    reportDownloads('omsætningsrapport',format=>url(format==='pdf'?'/sales-export.pdf':'/sales-export',params)));
   sales.append(table(['Dato','Ordrenummer','Type','Ekskl. moms','Moms','Inkl. moms'],rows.filter(r=>['sale','credit','replacement'].includes(r.kind)).map(r=>[r.date,r.orderNumber,types[r.kind],amount(r.amounts.net),amount(r.amounts.vat),amount(r.amounts.gross)])));
   const payments=panel('Quickpay-betalinger','Kun registrerede hævninger og refunderinger. Reservationer tæller ikke med.',downloads('Quickpay-betalinger','quickpay'));
   payments.append(table(['Betalingsdato','Ordrenummer','Type','Betalings-ID / operation','Quickpay-reference','Beløb'],rows.filter(r=>['capture','refund'].includes(r.kind)).map(r=>[r.date,r.orderNumber,types[r.kind],r.paymentId+' / '+r.operationId,r.quickpayReference,amount(r.amounts.gross)])));
   const clearing=panel('Clearhaus-afstemning','Viser de registrerede andele pr. ordre. Sammenhold referencerne med Clearhaus’ afregning og bankkontoudtoget; data hentes ikke automatisk.',downloads('Clearhaus-afstemning pr. ordre','clearhaus'));
   clearing.append(table(['Udbetalingsdato','Ordrenummer','Afregningsreference','Bankreference','Brutto','Refunderet','Gebyr','Regulering','Tilbageholdt','Udbetalt'],rows.filter(r=>r.kind==='settlement').map(r=>[r.date||'Dato mangler',r.orderNumber,r.settlementReference,r.bankReference,...['gross','refunds','fees','adjustments','held','bank'].map(k=>amount(r.amounts[k]))])));
   clearing.append(reportHeading('Samlet pr. udbetaling',downloads('Clearhaus-udbetalinger','udbetalinger'),'h3'),table(['Dato','Afregningsreference','Bankreference','Ordreandele','Gebyr','Udbetalt'],report.payouts.map(p=>[p.payoutDate,p.settlementReference,p.bankReference,p.allocationIds.length,amount(p.amounts.fees),amount(p.amounts.bank)])));
   if(report.unassignedSettlements.length)clearing.append(reportHeading('Historiske afregninger uden dato',downloads('historiske afregninger uden dato','afregninger-uden-dato'),'h3'),table(['Ordrenummer','Afregningsreference','Bankreference','Udbetalt'],report.unassignedSettlements.map(r=>[r.orderNumber,r.settlementReference,r.bankReference,amount(r.amounts.bank)])));
   payments.append(reportHeading('Registrerede bankbetalinger',downloads('registrerede bankbetalinger','bankbetalinger'),'h3'),table(['Betalingsdato','Ordrenummer','Fakturanummer','Bankreference','Beløb'],rows.filter(r=>r.kind==='bank_payment').map(r=>[r.date,r.orderNumber,r.invoiceReference,r.bankReference,amount(r.amounts.gross)])));
   const documents=panel('Bilag og kvitteringer','Hent registrerede originalbilag og de kvitteringer, der er gemt på ordren. Eksporten viser en oversigt over alle gemte versioner.',downloads('bilagsoversigt','bilagsoversigt'));
   documents.append(table(['Dato','Ordrenummer','Type','Reference','Bilag'],documentRows(rows)));
   function addIssues(section){
    if(!report.issues.length)return;
    const list=el('ul');for(const issue of report.issues)list.append(el('li',(issues[issue.code]||issue.code)+' · '+issue.orderId));section.append(list);
   }
   reports.append(financialOverview,sales,payments,clearing,documents);
   if(key){
    const close=panel('Månedsafstemning');
    const states={open:'Afventer afstemning',reconciled:'Afstemt',changed:'Grundlaget er ændret siden sidste afstemning'};
    close.append(el('p',states[periodStatus]),el('p','En afstemning gemmer en version til dokumentation. Den bogfører intet.'));
    if(issueDownloads)close.append(reportHeading('Afvigelser i datakontrol',issueDownloads,'h3'));
    addIssues(close);
    for(const v of versions){
     const p=el('p','Version '+v.version+' · '+new Date(v.reconciledAt).toLocaleDateString('da-DK')+' · '+v.statementReference+' · Ikke overført. ');
     p.append(downloadLink('Hent afstemt grundlag (JSON)',url('/basis',{period:key,version:v.version})));close.append(p);
    }
    if(canReconcile&&periodStatus!=='reconciled'&&!report.issues.some(i=>i.blocking)){
     const form=el('form'),reference=el('input'),confirm=el('input'),refLabel=el('label','Reference til kontoudtog og afstemning '),confirmLabel=el('label',' Jeg har gennemgået månedens bilag, udbetalinger og viste afvigelser.'),save=el('button','Markér måneden som afstemt'),feedback=el('p');
     reference.required=true;reference.maxLength=200;confirm.type='checkbox';confirm.required=true;save.type='submit';
     refLabel.append(reference);confirmLabel.prepend(confirm);feedback.setAttribute('role','status');form.append(refLabel,confirmLabel,save,feedback);close.append(form);
     form.onsubmit=async event=>{
      event.preventDefault();save.disabled=true;
      try{await api(url('/reconcile',{period:key}),'POST',{statementReference:reference.value,fingerprint:report.fingerprint,basisVersion:versions[0]?.version||0,confirmed:confirm.checked});if(root.isConnected&&mode.value==='month'&&period.input.value===key)await load();}
      catch(error){feedback.textContent=error.message;save.disabled=false;}
     };
    }else if(!data.canReconcile&&data.periodStatus==='open')close.append(el('p',data.reconciliationAvailable?'Måneden skal være afsluttet, før den kan afstemmes.':'Rapporter kan hentes her. Lagring af afstemningen kræver det validerede SQLite-arbejdsområde.'));
    reports.append(close);
   }else{
    const check=panel('Datakontrol','Vælg en måned for at gemme eller se en månedsafstemning.',issueDownloads);
    addIssues(check);reports.append(check);
   }
   if(integration){
    const p=panel('Integrationer');
    p.append(el('p','e-conomic – Ikke tilsluttet'),el('p','Før overførsel kan aktiveres, skal forbindelsen, kontoplanen, momskoderne, bogføringsmetoden og afsendelsesrettighederne konfigureres og godkendes.'));
    reports.append(p);
   }
  }
 }
 filter.onsubmit=event=>{event.preventDefault();void load();};
 return load();
}
