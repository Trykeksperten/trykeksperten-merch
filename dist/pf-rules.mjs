export function validateDecoration(option, design){
 if(!option)return 'Vælg en tilgængelig trykmulighed.';
 const w=Number(design.width),h=Number(design.height),colors=Number(design.colors);
 if(!(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0))return 'Angiv en positiv bredde og højde.';
 const maxW=Number(option.impWidthMm)||Number(option.impDiameterMm),maxH=Number(option.impHeightMm)||Number(option.impDiameterMm);
 if((maxW&&w>maxW)||(maxH&&h>maxH))return 'Designet overstiger de maksimale trykmål.';
 if(Number(option.impDiameterMm)>0&&Math.hypot(w,h)>Number(option.impDiameterMm))return 'Det rektangulære design skal kunne være inden for det runde trykområde.';
 const limits=[Number(option.maxLogoSizeCm2),Number(option.maxAreaCm2)].filter(n=>n>0);const limit=limits.length?Math.min(...limits):0;
 if(limit&&w*h/100>limit)return 'Designet overstiger det tilladte trykareal.';
 if(!Number.isInteger(colors)||colors<1||(Number(option.maxColours)>0&&colors>Number(option.maxColours)))return 'Vælg et tilladt antal trykfarver.';
 if(!design.text?.trim()&&!design.logo)return 'Skriv en tekst eller tilføj et logo.';
 return '';
}

function checkedURL(value,host,path){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname===host&&url.pathname.startsWith(path)?url:null;}catch{return null;}}
export function placementOptionAssets(product,option){
 const model=String(product?.modelCode||'').toLowerCase(),width=Number(option?.impWidthMm)||Number(option?.impDiameterMm),height=Number(option?.impHeightMm)||Number(option?.impDiameterMm);
 const svgURL=checkedURL(option?.svg,'imagedata.pfconcept.com','/2d/models/'),svgModel=svgURL?.pathname.match(/^\/2d\/models\/([^/]+)\/svg\//i)?.[1]?.toLowerCase(),svg=svgModel===model?svgURL.href:null;
 const imageURL=checkedURL(option?.image,'images.pfconcept.com','/ImprintImages_All/JPG/500x500/'),imageName=decodeURIComponent(imageURL?.pathname.split('/').at(-1)||'').toLowerCase(),image=imageName.startsWith(model)?imageURL.href:null;
 return {ready:Boolean(width>0&&height>0&&(svg||image)),width,height,svg,image};
}

export function blankProductSelection(product,variant,quantity){
 if(!variant||variant.decorationMandatory!==false)throw Error('Produktet kræver dekoration, eller muligheden for køb uden tryk er ikke bekræftet.');
 if(!Number.isInteger(quantity)||quantity<1)throw Error('Angiv et helt antal større end nul.');
 return {optionId:'blank',decoration:'none',method:'Uden tryk',modelCode:product.modelCode,sku:variant.sku,quantity};
}
