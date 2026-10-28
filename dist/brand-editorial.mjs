import {brandCampaignPhotos} from './brand-campaign-data.mjs?v=2';
const photos={
 herschel:[
  {file:'herschel-1',width:2400,height:1591,alt:'Herschel-taske med plads til hverdagens ting'},
  {file:'herschel-2',width:1591,height:2400,alt:'Herschel-taske over skulderen i byen'}
 ],
 'hydro-flask':[{file:'hydro-flask',width:1600,height:1600,alt:'Hydro Flask-flaske på farten'}],
 'ocean-bottle':[
  {file:'ocean-bottle-1',width:1800,height:2400,alt:'Orange Ocean Bottle mellem to hænder'},
  {file:'ocean-bottle-2',width:1612,height:2400,alt:'Ocean Bottle båret over skulderen ved vandet'}
 ],
 'stanley-1913':[{file:'stanley',width:1619,height:2400,alt:'Stanley-krus på tur i sneen'}],
 chipolo:[{file:'chipolo',width:2400,height:2399,alt:'Chipolo-tracker på en rygsæk'}]
};
const renderPhoto=photo=>`<figure class="brand-lifestyle${photo.trimWhite?' brand-lifestyle--trim-white':''}${photo.ratio?' brand-lifestyle--campaign':''}${photo.wide?' brand-lifestyle--wide':''}" style="--photo-aspect:${photo.width/photo.height}${photo.ratio?`;--brand-photo-ratio:${photo.ratio>3?photo.ratio:Math.max(1,photo.ratio)}`:''}"><img src="${photo.src||(photo.ratio?'/assets/brand-campaign/'+photo.file:'/assets/brand-lifestyle/'+photo.file+'.webp')}" alt="${photo.alt}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async"></figure>`;
export function brandEditorialImages(brand){
 if(brand==='herschel')return [`<div class="brand-lifestyle-pair">${photos.herschel.map(renderPhoto).join('')}</div>`,...(brandCampaignPhotos[brand]||[]).map(renderPhoto)];
 const candidates=photos[brand]?[...photos[brand],...(brandCampaignPhotos[brand]||[])]:brandCampaignPhotos[brand]||[];
 const extra=brand==='stanley-1913'?[{src:'/assets/stanley-quencher-people.jpg',trimWhite:true,width:640,height:800,alt:'To personer med farverige Stanley Quencher-krus'}]:brand==='karst'?[{src:'/assets/karst-orange-journal.webp',width:1080,height:1080,alt:'Orange Karst Stone Paper Journal'}]:[];
 return [...extra,...candidates].map(renderPhoto);
}
// Keys are product counts: the photographs never replace or count as products.
export function brandEditorialBlocks(brand,count){
 const blocks=new Map();if(!Number.isInteger(count)||count<1)return blocks;

 if(brand==='herschel'){blocks.set(Math.min(count,4),`<div class="brand-lifestyle-pair">${photos.herschel.map(renderPhoto).join('')}</div>`);return blocks;}
 const requested=count<10?1:count<24?2:3;
 const candidates=photos[brand]?[...photos[brand],...(brandCampaignPhotos[brand]||[])]:brandCampaignPhotos[brand]||[];
 for(const [index,photo] of candidates.slice(0,requested).entries()){
  const after=Math.min(count,count<=4?(index+1)*2:4+index*8);
  const html=renderPhoto(photo);
  blocks.set(after,(blocks.get(after)||'')+html);
 }
 return blocks;
}
export function showBrandEditorial(params,page){
 return page===1&&Boolean(params.get('brand'))&&[...params.keys()].every(key=>['brand','sortering','side'].includes(key));
}
