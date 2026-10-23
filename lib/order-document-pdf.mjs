import {PDFDocument,StandardFonts,rgb,PDFName,PDFString} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
const money=n=>(n/100).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})+' kr.';
const titles={basis:'Fakturagrundlag',shipment:'Forsendelsesbekræftelse',receipt:'Kvittering'};
export async function renderOrderDocument(d){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 pdf.setTitle(`${titles[d.type]} · ${d.reference}`);pdf.setAuthor('Smerch');
 const orange=rgb(.88,.27,.08),ink=rgb(.09,.13,.11),muted=rgb(.39,.44,.41),line=rgb(.83,.86,.83),pale=rgb(.95,.96,.95);
 let page,y;const pages=[];
 const clean=s=>Array.from(String(s??'').replaceAll('\t',' ').replace(/[\u0000-\u0008\u000b-\u001f]/g,'')).map(c=>{if(c==='\n'||c==='\r')return c==='\n'?'\n':'';try{regular.encodeText(c);return c;}catch{if(c==='→')return '>';throw Error('PDF understøtter ikke tegnet '+c+'. Ret tegnet i dokumentet før generering.');}}).join('');
 const put=(s,x,yy,size=10,font=regular,color=ink)=>page.drawText(clean(s),{x,y:yy,size,font,color});
 const wrap=(s,width,size=10,font=regular)=>{const result=[];for(const paragraph of clean(s).split('\n')){let row='';for(const char of paragraph){if(font.widthOfTextAtSize(row+char,size)>width){const last=row.lastIndexOf(' ');if(last>0){result.push(row.slice(0,last));row=row.slice(last+1);}else{result.push(row);row='';}}row+=char;}result.push(row);}return result;};
 let logo;try{logo=await pdf.embedPng(await readFile(new URL('../dist/assets/smerch-email.png',import.meta.url)));}catch{}
 function newPage(){page=pdf.addPage([595.28,841.89]);pages.push(page);page.drawRectangle({x:0,y:834,width:595.28,height:8,color:orange});if(logo){const size=logo.scale(112/logo.width);page.drawImage(logo,{x:42,y:775,width:size.width,height:size.height});}else put('Smerch',42,782,26,bold,orange);put(titles[d.type],42,734,25,bold);y=707;}
 function ensure(height){if(y-height<74)newPage();}
 function block(s,{size=10,font=regular,color=ink,width=511}={}){for(const row of wrap(s,width,size,font)){ensure(size+5);put(row,42,y,size,font,color);y-=size+5;}y-=5;}
 function rule(){ensure(15);page.drawLine({start:{x:42,y},end:{x:553,y},color:line,thickness:.7});y-=18;}
 newPage();block(d.type==='basis'?'Til bogholderen · Ikke en faktura eller betalingsanmodning.':d.type==='receipt'?'Betaling registreret · Dette dokument er en kvittering.':'Dine varer er afsendt og på vej.',{color:muted});
 block('Ordrereference: '+d.reference,{font:bold});block('Ordredato: '+d.date);
 if(d.type==='basis')block('Den endelige faktura og fakturanummeret oprettes manuelt i e-conomic.',{size:9,color:muted});
 rule();
 const customer=[d.customer.name,d.customer.contact&&d.customer.contact!==d.customer.name?d.customer.contact:'',d.type==='shipment'?d.deliveryAddress:d.customer.address,d.customer.cvr?'CVR: '+d.customer.cvr:'',d.customer.ean?'EAN: '+d.customer.ean:'',d.customer.email,d.customer.reference?'Kundereference: '+d.customer.reference:''].filter(Boolean).join('\n');
 const sender=[d.company.name,d.company.legalName,d.company.address,'CVR: '+d.company.cvr,d.company.email,d.company.phone].join('\n');
 // Both address blocks start together, and can continue across pages for long entries.
 const left=wrap(customer,245,9),right=wrap(sender,235,9),count=Math.max(left.length,right.length);
 put(d.type==='shipment'?'Modtager':'Kunde / fakturering',42,y,10,bold,orange);put('Afsender',318,y,10,bold,orange);y-=21;
 for(let i=0;i<count;i++){ensure(16);if(left[i])put(left[i],42,y,9);if(right[i])put(right[i],318,y,9);y-=14;}y-=13;
 if(d.type==='shipment')block(['Afsendt: '+d.shipDate,d.carrier?'Transportør: '+d.carrier:''].filter(Boolean).join('\n'),{font:bold});
 rule();
 function tableHeader(){ensure(40);page.drawRectangle({x:42,y:y-8,width:511,height:27,color:pale});put('Produkt / variant',49,y,9,bold);put('Antal',325,y,9,bold);if(d.type!=='shipment'){put('Stk. ekskl. moms',375,y,8,bold);put('I alt ekskl. moms',470,y,8,bold);}y-=30;}
 tableHeader();
 for(const row of d.lines.filter(l=>d.type!=='shipment'||l.quantity>0)){
 const content=[...wrap(row.description,266,10,bold).map(t=>({t,font:bold})),...wrap(row.variant,266,9).map(t=>({t,font:regular})),...(row.discount?wrap('Rabat (indregnet): '+row.discount,266,9).map(t=>({t,font:regular})):[])];
 if(y-48<74){newPage();tableHeader();}let first=true;
 for(const part of content){if(y<92){newPage();tableHeader();}put(part.t,49,y,part.font===bold?10:9,part.font);if(first){put(String(row.quantity),325,y,10);if(d.type!=='shipment'){const unit=(row.net/100/row.quantity).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:4});put(unit,375,y,9);const total=money(row.net);put(total,546-regular.widthOfTextAtSize(total,9),y,9);}first=false;}y-=14;}y-=9;rule();
 }
 if(d.type!=='shipment'){
 ensure(125);for(const [label,value,strong] of [['Fragt ekskl. moms',d.freight],['Subtotal ekskl. moms',d.net],['Moms',d.vat],['I alt inkl. moms',d.total,true]]){put(label,300,y,10,strong?bold:regular);const amount=money(value);put(amount,546-(strong?bold:regular).widthOfTextAtSize(amount,10),y,10,strong?bold:regular);y-=22;}y-=6;
 block('Stykprisen er linjens samlede nettopris fordelt på antal, inklusive tryk og opstart. Rabat er indregnet i linjetotalen. Afrunding vises i linjetotalen.',{size:8,color:muted});
 block('Betalingsstatus: '+d.paymentStatus,{font:bold});
 if(d.type==='receipt')block('Betalingsdato: '+new Date(d.paidAt).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen'}));
 if(d.paymentTerms)block('Betalingsbetingelser: '+d.paymentTerms);
 if(d.adjusted)block('Beløb eller antal er rettet i dette fakturagrundlag. Den oprindelige ordre er uændret.',{font:bold,color:orange});
 }
 if(d.type==='shipment'&&d.tracking){block('Tracking',{font:bold});for(const original of d.tracking.split('\n')){const fullURL=(original.match(/https?:\/\/[^\s]+/)||[])[0];let target;try{const u=new URL(fullURL);if(!u.username&&!u.password&&['https:','http:'].includes(u.protocol))target=u.href;}catch{}for(const row of wrap(original,511,9)){ensure(16);put(row,42,y,9,regular,orange);if(target){const annotation=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[42,y-2,42+regular.widthOfTextAtSize(row,9),y+11],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(target)}}));page.node.addAnnot(annotation);}y-=15;}}}
 if(d.notes&&d.type==='basis'){block('Bemærkninger til bogholderen',{font:bold});block(d.notes);}
 else if(d.notes)block(d.notes);

 pages.forEach((p,i)=>{page=p;page.drawLine({start:{x:42,y:52},end:{x:553,y:52},color:line,thickness:.7});put(`Smerch · ${titles[d.type]}`,42,36,8,regular,muted);put(`${i+1} / ${pages.length}`,520,36,8,regular,muted);});
 return pdf.save();
}
