import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
// An accounting source document, never an e-conomic invoice or payment request.
export async function renderInvoiceBasis(d){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),pages=[];
 pdf.setTitle('Fakturagrundlag · '+d.reference);pdf.setAuthor('Smerch');
 const ink=rgb(.1,.13,.12),muted=rgb(.4,.44,.42),orange=rgb(.81,.3,.13),ruleColor=rgb(.7,.73,.71);let page,y;
 const clean=value=>Array.from(String(value??'').replaceAll('\t',' ').replace(/[\u0000-\u0008\u000b-\u001f]/g,'')).map(c=>{if(c==='\n')return c;if(c==='\r')return '';if(c==='→')return '>';if(/[–—‑]/.test(c))return '-';try{regular.encodeText(c);return c;}catch{throw Error('PDF understøtter ikke tegnet '+c+'. Ret tegnet i dokumentet før generering.');}}).join('');
 const text=(value,x,yy,size=9,font=regular,color=ink)=>page.drawText(clean(value),{x,y:yy,size,font,color});
 const wrap=(value,width,size=9,font=regular)=>{const rows=[];for(const p of clean(value).split('\n')){let row='';for(const c of p){if(font.widthOfTextAtSize(row+c,size)>width){const at=row.lastIndexOf(' ');if(at>0){rows.push(row.slice(0,at));row=row.slice(at+1);}else{rows.push(row);row='';}}row+=c;}rows.push(row);}return rows;};
 const money=n=>(n/100).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2});
 const right=(value,x,yy,size=9,font=regular)=>text(value,x-font.widthOfTextAtSize(clean(value),size),yy,size,font);
 const rule=(yy,x=42,end=553)=>page.drawLine({start:{x,y:yy},end:{x:end,y:yy},thickness:.6,color:ruleColor});
 let logo;try{logo=await pdf.embedPng(await readFile(new URL('../dist/assets/smerch-email.png',import.meta.url)));}catch{}
 function header(){page=pdf.addPage([595.28,841.89]);pages.push(page);if(logo){const s=logo.scale(108/logo.width);page.drawImage(logo,{x:244,y:774,width:s.width,height:s.height});}else text('Smerch',245,779,27,bold,orange);text('FAKTURAGRUNDLAG',350,698,17,bold);rule(685,350);let metaY=667;for(const [label,value] of [['Ordre',d.reference],['Dato',d.date.split('-').reverse().join('.')],['Reference',d.customer.reference||'-']]){text(label,350,metaY,8,regular,muted);for(const row of wrap(value,145,8)){text(row,405,metaY,8);metaY-=12;}metaY-=4;}
 text('Ikke en faktura eller betalingsanmodning',350,metaY-6,7,regular,muted);
 const customer=[d.customer.name,d.customer.contact!==d.customer.name?d.customer.contact:'',d.customer.address,d.customer.cvr?'CVR: '+d.customer.cvr:'',d.customer.ean?'EAN: '+d.customer.ean:'',d.customer.email].filter(Boolean);let addressY=715;
 for(const [i,value] of customer.entries())for(const row of wrap(value,275,9,i===0?bold:regular)){text(row,42,addressY,9,i===0?bold:regular);addressY-=12;}
 y=Math.min(548,addressY-22,metaY-38);tableHeader();}
 function tableHeader(){rule(y);y-=14;text('Nr.',42,y,8);text('Produkt / variant',65,y,8);right('Antal',367,y,8);right('Stk. pris',454,y,8);right('Pris ekskl. moms',553,y,8);y-=8;rule(y);y-=18;}
 function continuation(){page=pdf.addPage([595.28,841.89]);pages.push(page);text('Smerch',42,792,19,bold,orange);text('Fakturagrundlag · '+d.reference,42,770,9);y=742;tableHeader();}
 function need(h){if(y-h<290)continuation();}
 header();
 for(const [i,l] of d.lines.entries()){const rows=[...wrap(l.description,185,10,bold).map(t=>[t,bold,10]),...wrap(l.variant,185,8).filter(Boolean).map(t=>[t,regular,8]),...(l.discount?wrap('Rabat (indregnet): '+l.discount,185,8).map(t=>[t,regular,8]):[])];need(Math.min(70,rows.length*14+10));let first=true;for(const [row,font,size] of rows){need(14);text(row,65,y,size,font);if(first){text(String(i+1),42,y,9);right(String(l.quantity),367,y,9);right((l.net/100/l.quantity).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:4}),454,y,9);right(money(l.net),553,y,9);first=false;}y-=14;}y-=10;}
 // Totals are anchored low on short documents, leaving the familiar invoice whitespace.
 y=Math.min(y-16,d.compactBasis?320:255);rule(y);y-=21;
 for(const [label,value,strong] of [['Fragt ekskl. moms',d.freight],['Subtotal ekskl. moms',d.net],['Moms',d.vat],['Total DKK inkl. moms',d.total,true]]){text(label,330,y,10,strong?bold:regular);right(money(value),553,y,10,strong?bold:regular);y-=19;}
 rule(y+5,330);y-=15;
 const paragraphs=['Betalingsstatus: '+d.paymentStatus,'Betalingsbetingelser: '+d.paymentTerms,d.adjusted?'Rettede beløb eller antal. Den oprindelige ordre er uændret.':'',d.notes?'Til bogholderen: '+d.notes:'','Den endelige faktura og fakturanummer oprettes manuelt i e-conomic.','Stykprisen inkluderer tryk og opstart fordelt på antal. Rabat er indregnet.'];
 for(const paragraph of paragraphs.filter(Boolean))for(const row of wrap(paragraph,511,8)){if(y<85){page=pdf.addPage([595.28,841.89]);pages.push(page);text('Fakturagrundlag · '+d.reference,42,790,12,bold);y=765;}text(row,42,y,8);y-=12;}
 const footer=['Smerch · '+d.company.legalName+' · '+d.company.address.replaceAll('\n',' · ')+' · CVR '+d.company.cvr,[d.company.email,d.company.phone].filter(Boolean).join(' · ')];
 pages.forEach((p,i)=>{page=p;rule(58);let fy=46;for(const row of footer.flatMap(t=>wrap(t,470,7))){text(row,42,fy,7,regular,muted);fy-=10;}right(`${i+1} / ${pages.length}`,553,46,7);});
 return pdf.save();
}
