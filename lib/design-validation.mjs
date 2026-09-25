import {validateDecoration,blankProductSelection,placementOptionAssets} from '../dist/pf-rules.mjs';
import {designGroupSize,normalizeTextPlacement,artworkPrintSize,validateArtworkLayers} from '../dist/design-layers.mjs';
import {logoPreflight} from '../dist/logo-preflight.mjs';
import {availableTextFonts,defaultTextPlacement,textAlignments,textLineSpacings} from '../dist/pf-text.mjs';

const allowedFormats=new Map([['pdf','application/pdf'],['eps','application/postscript'],['ai','application/illustrator'],['cdr','application/vnd.corel-draw']]);
const finite=value=>Number.isFinite(Number(value));
const close=(a,b,tolerance=.11)=>Math.abs(Number(a)-Number(b))<=tolerance;
const cleanText=(value,max)=>typeof value==='string'?value.slice(0,max):'';

function cleanLogo(logo){
 if(!logo||typeof logo!=='object'||typeof logo.id!=='string'||!logo.id||logo.id.length>128||typeof logo.name!=='string'||!logo.name||logo.name.length>200||allowedFormats.get(logo.name.split('.').pop().toLowerCase())!==logo.type)throw Error('Vælg en EPS-, CDR-, PDF- eller AI-fil.');
 const size=Number(logo.size),pixelWidth=Number(logo.pixelWidth||0),pixelHeight=Number(logo.pixelHeight||0);
 if(!Number.isFinite(size)||size<1||size>5*1024*1024)throw Error('En logofil overskrider den tilladte størrelse.');
 if((pixelWidth&&(!Number.isInteger(pixelWidth)||pixelWidth<1||pixelWidth>100000))||(pixelHeight&&(!Number.isInteger(pixelHeight)||pixelHeight<1||pixelHeight>100000)))throw Error('Et logobilledes dimensioner er ugyldige.');
 return {id:logo.id,name:logo.name,type:logo.type,size,pixelWidth,pixelHeight};
}

function cleanTextPlacement(value,option){
 if(value===undefined||value===null)return defaultTextPlacement();
 const x=Number(value.x),y=Number(value.y),scale=Number(value.scale);
 if(![x,y,scale].every(Number.isFinite)||x<0||x>1||y<0||y>1||scale<.05||scale>1)throw Error('Tekstens placering er ugyldig.');
 const defaults=defaultTextPlacement(),font=value.font??defaults.font,align=value.align??defaults.align,lineSpacing=Number(value.lineSpacing??defaults.lineSpacing),rotation=Number(value.rotation??defaults.rotation);
 if(!availableTextFonts(option).includes(font)||!textAlignments.includes(align)||!textLineSpacings.includes(lineSpacing))throw Error('Vælg en tilladt skrifttype og tekstopsætning.');
 if(!Number.isFinite(rotation)||rotation< -180||rotation>180)throw Error('Tekstens rotation er ugyldig.');
 return {x,y,scale,font,align,lineSpacing,rotation};
}

function cleanArtwork(value,option){
 if(!value||typeof value!=='object'||typeof value.id!=='string'||!value.id||value.id.length>128)throw Error('Et designlag er ugyldigt.');
 if(![value.x,value.y,value.scale].every(finite))throw Error('Et designlag har ugyldige koordinater.');
 const logo=cleanLogo(value.logo),artwork={id:value.id,logo,x:Number(value.x),y:Number(value.y),scale:Number(value.scale)};
 if(value.color!==undefined){
  if(typeof value.color!=='string'||!/^#[0-9a-f]{6}$/i.test(value.color))throw Error('Logoets farveønske er ugyldigt.');
  artwork.color=value.color.toLowerCase();
 }
 const error=validateArtworkLayers([artwork],option);if(error)throw Error(error);
 const size=artworkPrintSize(artwork,option),preflight=logoPreflight({type:logo.type,pixelWidth:logo.pixelWidth,pixelHeight:logo.pixelHeight,widthMm:size.widthMm,heightMm:size.heightMm});
 return {...artwork,widthMm:Math.round(size.widthMm*10)/10,heightMm:Math.round(size.heightMm*10)/10,preflight};
}

export function sanitizeDesignLine(catalog,line){
 const product=catalog.products.find(product=>product.id===line?.productId),variant=product?.variants.find(variant=>variant.sku===line?.sku),quantity=Number(line?.quantity);
 if(!variant)throw Error('Produktet eller varianten findes ikke længere.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw Error('Vælg mellem 1 og 100.000 stk.');
 if(!Array.isArray(line.decorations)||line.decorations.length>20)throw Error('Ugyldige trykvalg.');
 if(!line.decorations.length){blankProductSelection(product,variant,quantity);return {productId:product.id,sku:variant.sku,quantity,decorations:[]};}
 const positions=new Set(),decorations=line.decorations.map(value=>{
  if(!value||typeof value!=='object')throw Error('Et trykvalg er ugyldigt.');
  const option=variant.options.find(option=>option.id===value.optionId);if(!option)throw Error('Vælg en tilgængelig trykmulighed.');
  if(!placementOptionAssets(product,option).ready)throw Error('PF Concept mangler et gyldigt mockup eller trykmål for denne placering.');
  if(positions.has(option.impLocationCode))throw Error('Vælg kun én trykmetode pr. placering.');positions.add(option.impLocationCode);
  if(typeof value.text!=='string'||value.text.length>200)throw Error('Teksten er for lang.');
  const text=cleanText(value.text,200),ink=/^#[0-9a-f]{6}$/i.test(value.ink||'')?value.ink:'#17201f',colors=Number(value.colors);
  const source=Array.isArray(value.artworks)?value.artworks:value.logo?[{id:`legacy-${value.logo.id}`,logo:value.logo,x:.5,y:.5,scale:.34}]:[];
  if(source.length>10)throw Error('Der kan højst bruges 10 logoer på én placering.');
  const artworks=source.map(artwork=>cleanArtwork(artwork,option));
  if(!text.trim()&&!artworks.length)throw Error('Skriv en tekst eller tilføj et logo.');
  const rawTextPlacement=cleanTextPlacement(value.textPlacement,option),textPlacement=normalizeTextPlacement(text,rawTextPlacement,option);if(!close(rawTextPlacement.x,textPlacement.x,.0001)||!close(rawTextPlacement.y,textPlacement.y,.0001)||!close(rawTextPlacement.scale,textPlacement.scale,.0001))throw Error('Teksten ligger uden for trykfladen.');
  const group=designGroupSize(artworks,text,textPlacement,option),width=Math.round(group.widthMm*10)/10,height=Math.round(group.heightMm*10)/10;
  if(!close(value.width,width)||!close(value.height,height))throw Error('Designets samlede trykmål stemmer ikke med lagene.');
  const decoration={optionId:option.id,method:option.impMethod,position:option.impLocation,methodCode:option.impMethodCode,positionCode:option.impLocationCode,printCode:option.printCode,modelCode:product.modelCode,sku:variant.sku,width,height,colors,text,ink,textPlacement,artworks,logo:artworks[0]?.logo||null,quantity,placementImage:option.image||null,placementSvg:option.svg||null,placementCoordinates:{topLeft:[option.coorTopLeftX,option.coorTopLeftY],topRight:[option.coorTopRightX,option.coorTopRightY],bottomLeft:[option.coorBottomLeftX,option.coorBottomLeftY],bottomRight:[option.coorBottomRightX,option.coorBottomRightY]}};
  const error=validateDecoration(option,decoration);if(error)throw Error(error);
  const checks=artworks.map(artwork=>artwork.preflight),preflight=checks.some(check=>check.status==='rejected')?{status:'rejected',label:'Logo skal udskiftes'}:checks.some(check=>check.status==='review')?{status:'review',label:'Kræver filkontrol'}:{status:'approved',label:artworks.length?'Teknisk godkendt':'Tekst klar'};
  if(preflight.status==='rejected')throw Error('Et logo har for lav opløsning ved den valgte trykstørrelse.');
  return {...decoration,preflight};
 });
 return {productId:product.id,sku:variant.sku,quantity,decorations};
}

export function validateDesignLine(catalog,line){try{sanitizeDesignLine(catalog,line);return '';}catch(error){return error.message;}}
