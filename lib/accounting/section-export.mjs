import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {amount,csvText} from './sales-export.mjs';

const dkk=header=>header+' (DKK)';
const money=value=>Number.isSafeInteger(value)?amount(value):'';
const allocations=['gross','refunds','fees','adjustments','held','bank'];
const documentTypes={
 invoice:'Faktura',credit:'Kreditnota',replacement:'Erstatningsfaktura',
 payment_receipt:'Betalingskvittering',accountant_payment_receipt:'Bogholderkvittering',
 accountant_invoice_request:'Fakturaanmodning',accountant_basis:'Fakturagrundlag',refund_basis:'Refunderingsgrundlag'
};
const sections=new Map([
 ['overblik',{
  title:'Regnskabsoverblik',headers:['Nøgletal',dkk('Beløb')],widths:[3,1],
  rows:({totals})=>[
   ['Omsætning ekskl. moms',money(totals.salesNet)],['Moms',money(totals.salesVAT)],
   ['Omsætning inkl. moms',money(totals.salesGross)],['Hævet via Quickpay',money(totals.captured)],
   ['Refunderinger via Quickpay',money(totals.refunded)],['Registrerede bankbetalinger',money(totals.bankPayments)],
   ['Registrerede afregningsgebyrer',money(totals.fees)],['Registrerede bankudbetalinger',money(totals.payouts)]
  ],numericFrom:1
 }],
 ['quickpay',{
  title:'Quickpay-betalinger',headers:['Betalingsdato','Ordrenummer','Type','Betalings-ID','Operation','Quickpay-reference',dkk('Beløb')],
  widths:[1,1.4,1,1,0.75,1.75,1],numericFrom:6,
  rows:({rows})=>rows.filter(r=>r.kind==='capture'||r.kind==='refund').map(r=>
   [r.date,r.orderNumber,r.kind==='capture'?'Hævning':'Refundering',r.paymentId,r.operationId,r.quickpayReference,money(r.amounts.gross)])
 }],
 ['bankbetalinger',{
  title:'Registrerede bankbetalinger',headers:['Betalingsdato','Ordrenummer','Fakturanummer','Bankreference',dkk('Beløb')],
  widths:[1,1.25,1.25,1.5,1],numericFrom:4,
  rows:({rows})=>rows.filter(r=>r.kind==='bank_payment').map(r=>
   [r.date,r.orderNumber,r.invoiceReference,r.bankReference,money(r.amounts.gross)])
 }],
 ['clearhaus',{
  title:'Clearhaus-afstemning pr. ordre',headers:['Udbetalingsdato','Ordrenummer','Afregningsreference','Bankreference',
   ...['Brutto','Refunderet','Gebyr','Regulering','Tilbageholdt','Udbetalt'].map(dkk)],
  widths:[1.2,1.25,1.45,1.6,.9,.95,.85,.95,.95,.95],numericFrom:4,
  rows:({rows})=>rows.filter(r=>r.kind==='settlement').map(r=>
   [r.date,r.orderNumber,r.settlementReference,r.bankReference,...allocations.map(k=>money(r.amounts[k]))])
 }],
 ['udbetalinger',{
  title:'Clearhaus-udbetalinger',headers:['Udbetalingsdato','Afregningsreference','Bankreference','Ordreandele',dkk('Gebyr'),dkk('Udbetalt')],
  widths:[1,1.5,1.5,1,1,1],numericFrom:3,
  rows:({payouts})=>payouts.map(p=>
   [p.payoutDate,p.settlementReference,p.bankReference,p.allocationIds.length,money(p.amounts.fees),money(p.amounts.bank)])
 }],
 ['afregninger-uden-dato',{
  title:'Historiske afregninger uden dato',headers:['Ordrenummer','Afregningsreference','Bankreference',dkk('Udbetalt')],
  widths:[1.25,1.5,1.5,1],numericFrom:3,
  rows:({unassignedSettlements})=>unassignedSettlements.map(r=>
   [r.orderNumber,r.settlementReference,r.bankReference,money(r.amounts.bank)])
 }],
 ['bilagsoversigt',{
  title:'Bilagsoversigt',headers:['Dato','Ordrenummer','Type','Reference','Originalformat'],
  widths:[1,1.4,1.5,3,1],numericFrom:5,
  rows:({rows})=>rows.filter(r=>r.kind==='document').map(r=>
   [r.date,r.orderNumber,documentTypes[r.type]||r.type,r.reference,r.format.toUpperCase()])
 }],
 ['datakontrol',{
  title:'Afvigelser i datakontrol',headers:['Ordrereference','Fejlkode','Blokerer afstemning'],
  widths:[2,2,1],numericFrom:3,
  rows:({issues})=>issues.map(i=>[i.orderId,i.code,i.blocking?'Ja':'Nej'])
 }]
]);

export function accountingExportSection(key,report){
 const section=sections.get(key);
 return section&&{...section,rows:section.rows(report)};
}

export function sectionCSV({headers,rows,numericFrom}){
 const lines=rows.map(row=>row.map((value,index)=>{
  if(value==null||value==='')return '';
  return index>=numericFrom?String(value):csvText(value);
 }).join(';'));
 return '\uFEFF'+[headers.join(';'),...lines,''].join('\r\n');
}

export async function sectionPDF({title,headers,rows,widths,numericFrom},{period,from,to}){
 const pdf=await PDFDocument.create();
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const supported=new Set(font.getCharacterSet());
 const ink=rgb(.1,.13,.12),muted=rgb(.29,.34,.31),line=rgb(.82,.85,.83),accent=rgb(.75,.27,.12);
 const [width,height]=headers.length>=7?[841.89,595.28]:[595.28,841.89];
 const margin=36,tableWidth=width-margin*2,size=9,lineHeight=13;
 const totalWeight=widths.reduce((sum,weight)=>sum+weight,0);
 const columns=widths.map(weight=>tableWidth*weight/totalWeight);
 const scope=period
  ?new Intl.DateTimeFormat('da-DK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T00:00:00Z'))
  :from===to?from:from+' til '+to;
 const heading=title+' · '+scope;
 pdf.setTitle(heading);
 pdf.setAuthor('Smerch');
 let page,y;

 function wrap(value,maxWidth,face){
  const text=Array.from(String(value??'').normalize('NFC'),char=>
   /\s/u.test(char)?' ':supported.has(char.codePointAt(0))?char:'?').join('');
  const lines=[''];
  for(const char of text){
   const index=lines.length-1,current=lines[index];
   if(face.widthOfTextAtSize(current+char,size)<=maxWidth){
    lines[index]+=char;
   }else{
    const space=current.lastIndexOf(' ');
    if(space>0&&char!==' '&&face.widthOfTextAtSize(current.slice(space+1)+char,size)<=maxWidth){
     lines[index]=current.slice(0,space);
     lines.push(current.slice(space+1)+char);
    }else lines.push(char.trimStart());
   }
  }
  return lines;
 }

 function rule(at){
  page.drawLine({start:{x:margin,y:at},end:{x:width-margin,y:at},thickness:.6,color:line});
 }

 function drawLine(cells,index,face){
  let x=margin;
  cells.forEach((lines,i)=>{
   const value=lines[index]||'';
   const left=i<numericFrom?x+4:x+columns[i]-4-face.widthOfTextAtSize(value,size);
   if(value)page.drawText(value,{x:left,y,size,font:face,color:ink});
   x+=columns[i];
  });
  y-=lineHeight;
 }

 function startPage(){
  page=pdf.addPage([width,height]);
  page.drawText('SMERCH',{x:margin,y:height-43,size:11,font:bold,color:accent});
  page.drawText(title,{x:margin,y:height-74,size:23,font:bold,color:ink});
  page.drawText(scope+' · DKK',{x:margin,y:height-95,size:10,font,color:muted});
  y=height-122;
  const cells=headers.map((value,i)=>wrap(value.replace(/ \(DKK\)$/, ''),columns[i]-8,bold));
  const lines=Math.max(...cells.map(cell=>cell.length));
  for(let i=0;i<lines;i++)drawLine(cells,i,bold);
  rule(y+5);
  y-=7;
 }

 startPage();
 if(!rows.length)page.drawText('Ingen registreringer i visningen.',{x:margin+4,y,size,font,color:muted});
 for(const row of rows){
  const cells=row.map((value,i)=>wrap(value,columns[i]-8,font));
  const lines=Math.max(...cells.map(cell=>cell.length));
  if(y<65+(Math.min(lines,3)-1)*lineHeight)startPage();
  for(let i=0;i<lines;i++){
   if(y<65)startPage();
   drawLine(cells,i,font);
  }
  rule(y+6);
  y-=5;
 }
 const pages=pdf.getPages();
 for(const [index,footer] of pages.entries()){
  page=footer;
  rule(49);
  const label=`Side ${index+1} af ${pages.length}`;
  page.drawText(label,{x:width-margin-font.widthOfTextAtSize(label,size),y:33,size,font,color:muted});
 }
 return Buffer.from(await pdf.save());
}
