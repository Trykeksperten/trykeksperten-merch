import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

const salesTypes=new Map([['sale','Afsendt salg'],['credit','Kreditnota'],['replacement','Erstatningsfaktura']]);
const headers=['Dato','Ordrenummer','Type','Ekskl. moms','Moms','Inkl. moms'];

export function amount(value){
 const digits=String(Math.abs(value)).padStart(3,'0');
 return (value<0?'-':'')+digits.slice(0,-2)+','+digits.slice(-2);
}
const salesRows=report=>report.rows.filter(row=>salesTypes.has(row.kind)).map(({date,orderNumber,kind,amounts})=>
 [date,orderNumber,salesTypes.get(kind),...[amounts.net,amounts.vat,amounts.gross].map(amount)]);
const totalsRow=({totals})=>['','','I alt',...[totals.salesNet,totals.salesVAT,totals.salesGross].map(amount)];

export function csvText(value){
 const text=String(value);
 const safe=/^\s*[=+@-]|^[\t\r\n]/u.test(text)?"'"+text:text;
 return '"'+safe.replaceAll('"','""')+'"';
}
export function salesCSV(report){
 const header=headers.map((title,index)=>index>=3?title+' (DKK)':title).join(';');
 const lines=salesRows(report).map(([date,orderNumber,...rest])=>[date,csvText(orderNumber),...rest].join(';'));
 return '\uFEFF'+[header,...lines,totalsRow(report).join(';'),''].join('\r\n');
}

export async function salesPDF(report){
 const pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const supported=new Set(regular.getCharacterSet());
 const ink=rgb(.1,.13,.12),accent=rgb(.75,.27,.12),muted=rgb(.29,.34,.31),line=rgb(.82,.85,.83);
 const columns=[42,108,263,428,488,553],size=9;
 const dateLabel=date=>date.split('-').reverse().join('.');
 const period=report.period
  ?new Intl.DateTimeFormat('da-DK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(report.period+'-01T00:00:00Z'))
  :dateLabel(report.from)+' - '+dateLabel(report.to);
 let page,y;
 pdf.setTitle('Omsætningsrapport · '+period);
 pdf.setAuthor('Smerch');

 function draw(text,x,baseline,{font=regular,fontSize=size,color=ink,right=false}={}){
  page.drawText(text,{x:right?x-font.widthOfTextAtSize(text,fontSize):x,y:baseline,size:fontSize,font,color});
 }
 function rule(baseline){
  page.drawLine({start:{x:42,y:baseline},end:{x:553,y:baseline},thickness:.6,color:line});
 }
 function cells(values,baseline,font=regular){
  values.forEach((value,index)=>{
   const right=index>=3;
   const width=index===3?83:columns[index]-columns[index-1]-6;
   const fontSize=right&&value?Math.min(size,size*width/font.widthOfTextAtSize(value,size)):size;
   draw(value,columns[index],baseline,{font,fontSize,right});
  });
 }
 function startPage(){
  page=pdf.addPage([595.28,841.89]);
  draw('SMERCH',42,792,{font:bold,fontSize:11,color:accent});
  draw('Omsætningsrapport',42,758,{font:bold,fontSize:25});
  draw(period+' · Beløb i DKK',42,737,{color:muted});
  cells(headers,704,bold);
  rule(695);
  y=679;
 }
 function orderLines(orderNumber){
  const lines=[''];
  for(const original of String(orderNumber).normalize('NFC')){
   const character=/\s/u.test(original)?' ':supported.has(original.codePointAt(0))?original:'?';
   const last=lines.length-1;
   if(regular.widthOfTextAtSize(lines[last]+character,size)<=columns[2]-columns[1]-12){
    lines[last]+=character;
    continue;
   }
   const breakAt=lines[last].lastIndexOf(' ');
   if(breakAt>0&&character!==' '){
    lines.push(lines[last].slice(breakAt+1)+character);
    lines[last]=lines[last].slice(0,breakAt);
   }else lines.push(character.trimStart());
  }
  return lines;
 }
 const rows=salesRows(report);
 startPage();
 if(!rows.length){
  draw('Ingen registreringer i perioden.',42,y,{color:muted});
  y-=22;
 }
 for(const [date,orderNumber,...rest] of rows){
  if(y<74)startPage();
  const [first,...continuation]=orderLines(orderNumber);
  cells([dateLabel(date),first,...rest],y);
  for(const part of continuation){
   y-=12;
   if(y<74)startPage();
   draw(part,columns[1],y);
  }
  rule(y-6);
  y-=19;
 }
 if(y<76)startPage();
 page.drawRectangle({x:38,y:y-8,width:519,height:22,color:rgb(.92,.95,.93)});
 cells(totalsRow(report),y,bold);
 const pages=pdf.getPages();
 for(const [index,footerPage] of pages.entries()){
  page=footerPage;
  rule(53);
  draw('Smerch · '+period,42,37,{color:muted});
  draw(`Side ${index+1} af ${pages.length}`,553,37,{color:muted,right:true});
 }
 return Buffer.from(await pdf.save());
}
