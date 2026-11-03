import {fetchJSON} from './fetch-json.mjs';

const shopDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'});
let stockRequest,refreshAt=0;

export function loadProductStock(){
 if(Date.now()>=refreshAt){
  refreshAt=Date.now()+5*60_000;
  stockRequest=fetchJSON('/api/pf-stock',{retries:0}).catch(()=>({available:false,message:'Lagerstatus kunne ikke indlæses.'})).then(stock=>{
   if(!stock?.available)refreshAt=Date.now()+30_000;
   return stock;
  });
 }
 return stockRequest;
}

function incomingDay(value){
 if(typeof value!=='string')return null;
 const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])/);
 const local=value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?=$|[T ])/);
 const day=iso?.[0]||(local&&[local[3],local[2],local[1]].join('-'));
 if(!day)return null;
 const date=new Date(day);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day?day:null;
}

// Only report a colour as out of stock when every offered size is confirmed sold out.
export function productStockStatus(variants,stock,now=new Date()){
 if(!stock?.available||!variants.length)return null;
 const rows=variants.map(variant=>stock.items?.[variant.sku]);
 if(!rows.every(row=>row?.available===0))return null;
 const today=shopDate.format(now);
 const dates=rows.map(row=>incomingDay(row.incomingDate)).filter(day=>day&&day>=today).sort();
 return {incomingDate:dates[0]||null};
}

export function createStockIndicator(photo,title){
 const badge=document.createElement('span'),notice=document.createElement('p');
 badge.className='product-stock-badge';
 badge.textContent='Ikke på lager';
 notice.className='product-stock-notice';
 return status=>{
  if(!status){badge.remove();notice.remove();return;}
  const [year,month,day]=status.incomingDate?.split('-')||[];
  const text=day?`Forventes på lager fra ${day}.${month}.${year}`:'Ny lagerdato er ikke oplyst';
  if(notice.dataset.stockCopy!==text){
   notice.dataset.stockCopy=text;
   notice.textContent=text;
  }
  if(!badge.parentNode)photo.append(badge);
  if(!notice.parentNode)title.after(notice);
 };
}
