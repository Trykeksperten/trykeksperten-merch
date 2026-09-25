import {availableTextFonts,defaultTextPlacement,textAlignments,textLineSpacings} from './pf-text.mjs';
export const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number(value)||0));

const number=value=>Number.isFinite(Number(value))?Number(value):0;
export function optionPrintSize(option={}){
 const width=number(option.impWidthMm)||number(option.impDiameterMm)||1;
 const height=number(option.impHeightMm)||number(option.impDiameterMm)||1;
 return {width,height,round:number(option.impDiameterMm)>0};
}

export function printableBounds(option={},naturalWidth=0,naturalHeight=0){
 const xs=[option.coorTopLeftX,option.coorTopRightX,option.coorBottomLeftX,option.coorBottomRightX].map(number).filter(value=>value>=0);
 const ys=[option.coorTopLeftY,option.coorTopRightY,option.coorBottomLeftY,option.coorBottomRightY].map(number).filter(value=>value>=0);
 if(xs.length<4||ys.length<4||(!xs.some(Boolean)&&!ys.some(Boolean)))return {x:.3,y:.3,width:.4,height:.4,source:'fallback'};
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 // PF's feed coordinates are exported at 3× the SVG viewBox resolution.
 // Use the actual placement image as the coordinate canvas and convert the
 // corners to that density before normalising them.
 const density=3;
 const width=number(naturalWidth)>0?number(naturalWidth)*density:Math.max(right*1.03,1);
 const height=number(naturalHeight)>0?number(naturalHeight)*density:Math.max(bottom*1.03,1);
 return {x:clamp(left/width),y:clamp(top/height),width:clamp((right-left)/width,.02,1),height:clamp((bottom-top)/height,.02,1),source:'coordinates'};
}

export function containMappedBounds(bounds,naturalWidth=0,naturalHeight=0,containerWidth=0,containerHeight=0){
 const nw=number(naturalWidth),nh=number(naturalHeight),cw=number(containerWidth),ch=number(containerHeight);
 if(!nw||!nh||!cw||!ch)return {...bounds};
 const scale=Math.min(cw/nw,ch/nh),renderedWidth=nw*scale,renderedHeight=nh*scale;
 const offsetX=(cw-renderedWidth)/2,offsetY=(ch-renderedHeight)/2;
 return {...bounds,x:clamp((offsetX+bounds.x*renderedWidth)/cw),y:clamp((offsetY+bounds.y*renderedHeight)/ch),width:clamp(bounds.width*renderedWidth/cw,.001,1),height:clamp(bounds.height*renderedHeight/ch,.001,1)};
}

export function artworkPrintSize(artwork={},option={}){
 const print=optionPrintSize(option),pixelWidth=number(artwork.logo?.pixelWidth),pixelHeight=number(artwork.logo?.pixelHeight);
 const aspect=pixelWidth>0&&pixelHeight>0?pixelWidth/pixelHeight:number(artwork.aspect)||1;
 let width=Math.max(.1,print.width*clamp(artwork.scale??.34,.05,1)),height=width/aspect;
 if(height>print.height){const factor=print.height/height;width*=factor;height*=factor;}
 if(print.round){const diagonal=Math.hypot(width/print.width,height/print.height);if(diagonal>1){width/=diagonal;height/=diagonal;}}
 return {widthMm:width,heightMm:height,widthFraction:width/print.width,heightFraction:height/print.height,aspect};
}

export function normalizeArtwork(artwork={}){
 return {
  ...artwork,
  x:clamp(artwork.x??.5,.04,.96),
  y:clamp(artwork.y??.5,.04,.96),
  scale:clamp(artwork.scale??.34,.08,1)
 };
}

function normalizeCenter(x,y,halfWidth,halfHeight,round){
 x=clamp(x,halfWidth,1-halfWidth);y=clamp(y,halfHeight,1-halfHeight);
 if(round){const allowedRadius=Math.max(0,.5-Math.hypot(halfWidth,halfHeight)),dx=x-.5,dy=y-.5,distance=Math.hypot(dx,dy);if(distance>allowedRadius&&distance>0){x=.5+dx/distance*allowedRadius;y=.5+dy/distance*allowedRadius;}}
 return {x,y};
}

export function normalizeArtworkForOption(artwork={},option={}){
 const normalized=normalizeArtwork(artwork),size=artworkPrintSize(normalized,option),halfWidth=size.widthFraction/2,halfHeight=size.heightFraction/2;
 return {...normalized,...normalizeCenter(normalized.x,normalized.y,halfWidth,halfHeight,optionPrintSize(option).round)};
}

export function fitArtworkToOption(artwork={},option={}){
 return normalizeArtworkForOption({...artwork,x:.5,y:.5,scale:1},option);
}

export function textPrintSize(text='',placement={},option={}){
 const print=optionPrintSize(option),scale=clamp(placement.scale??.24,.05,1),lines=String(text).trim().split(/\r?\n/),longest=Math.max(1,...lines.map(line=>Array.from(line).length)),lineSpacing=textLineSpacings.includes(Number(placement.lineSpacing))?Number(placement.lineSpacing):1.25,letterHeight=Math.max(.06,scale*.35),lineFactor=1+(lines.length-1)*lineSpacing,heightFraction=Math.min(.95,letterHeight*lineFactor),fontFactor=placement.font==='Lucida Calligraphy'?1.15:placement.font==='Times New Roman'?.95:1,charFactor=longest*.55*fontFactor,widthFraction=Math.max(.08,charFactor*letterHeight);
 // A vertical line is limited by the print area's height, not its narrow width.
 // Blend into that physical-size model as the user rotates the text; zero degrees
 // retains the established sizing of saved horizontal designs.
 const radians=Number(placement.rotation||0)*Math.PI/180,sin=Math.abs(Math.sin(radians)),cos=Math.abs(Math.cos(radians)),maxLetterHeight=Math.min(.95*print.width/(charFactor*cos+lineFactor*sin),.95*print.height/(charFactor*sin+lineFactor*cos));
 const targetWidth=charFactor*maxLetterHeight*scale,targetHeight=lineFactor*maxLetterHeight*scale;
 let width=(widthFraction*print.width*(1-sin)+targetWidth*sin)/print.width,height=(heightFraction*print.height*(1-sin)+targetHeight*sin)/print.height;
 const bounds=rotatedTextBounds({widthMm:width*print.width,heightMm:height*print.height},placement.rotation,option),fit=Math.min(1,.95/Math.max(bounds.widthFraction,.001),.95/Math.max(bounds.heightFraction,.001));width*=fit;height*=fit;
 if(print.round){const rotated=rotatedTextBounds({widthMm:width*print.width,heightMm:height*print.height},placement.rotation,option),diagonal=Math.hypot(rotated.widthFraction,rotated.heightFraction);if(diagonal>1){width/=diagonal;height/=diagonal;}}
 return {widthMm:width*print.width,heightMm:height*print.height,widthFraction:width,heightFraction:height};
}

export function rotatedTextBounds(size={},rotation=0,option={}){
 const print=optionPrintSize(option),radians=Number(rotation||0)*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
 return {widthFraction:(size.widthMm*cos+size.heightMm*sin)/print.width,heightFraction:(size.widthMm*sin+size.heightMm*cos)/print.height};
}

export function normalizeTextPlacement(text='',placement={},option={}){
 const defaults=defaultTextPlacement(),font=availableTextFonts(option).includes(placement.font)?placement.font:defaults.font,align=textAlignments.includes(placement.align)?placement.align:defaults.align,lineSpacing=textLineSpacings.includes(Number(placement.lineSpacing))?Number(placement.lineSpacing):defaults.lineSpacing,scale=clamp(placement.scale??.24,.05,1),rotation=clamp(placement.rotation??0,-180,180),size=textPrintSize(text,{...placement,font,lineSpacing,scale,rotation},option),bounds=rotatedTextBounds(size,rotation,option),center=normalizeCenter(placement.x??.5,placement.y??.5,bounds.widthFraction/2,bounds.heightFraction/2,optionPrintSize(option).round);
 return {...center,scale,font,align,lineSpacing,rotation};
}

export function artworkGroupSize(artworks=[],option={}){
 const print=optionPrintSize(option),boxes=artworks.map(artwork=>{const art=normalizeArtworkForOption(artwork,option),size=artworkPrintSize(art,option);return {left:(art.x-size.widthFraction/2)*print.width,right:(art.x+size.widthFraction/2)*print.width,top:(art.y-size.heightFraction/2)*print.height,bottom:(art.y+size.heightFraction/2)*print.height};});
 if(!boxes.length)return {widthMm:0,heightMm:0};
 return {widthMm:Math.max(...boxes.map(box=>box.right))-Math.min(...boxes.map(box=>box.left)),heightMm:Math.max(...boxes.map(box=>box.bottom))-Math.min(...boxes.map(box=>box.top))};
}

export function designGroupSize(artworks=[],text='',textPlacement={},option={}){
 const print=optionPrintSize(option),boxes=artworks.map(artwork=>{const art=normalizeArtworkForOption(artwork,option),size=artworkPrintSize(art,option);return {left:art.x-size.widthFraction/2,right:art.x+size.widthFraction/2,top:art.y-size.heightFraction/2,bottom:art.y+size.heightFraction/2};});
 if(String(text).trim()){const placement=normalizeTextPlacement(text,textPlacement,option),size=textPrintSize(text,placement,option),bounds=rotatedTextBounds(size,placement.rotation,option);boxes.push({left:placement.x-bounds.widthFraction/2,right:placement.x+bounds.widthFraction/2,top:placement.y-bounds.heightFraction/2,bottom:placement.y+bounds.heightFraction/2});}
 if(!boxes.length)return {widthMm:0,heightMm:0};
 return {widthMm:(Math.max(...boxes.map(box=>box.right))-Math.min(...boxes.map(box=>box.left)))*print.width,heightMm:(Math.max(...boxes.map(box=>box.bottom))-Math.min(...boxes.map(box=>box.top)))*print.height};
}

export function artworkFitsOption(artwork={},option={},tolerance=.0001){
 if(!Number.isFinite(Number(artwork.x))||!Number.isFinite(Number(artwork.y))||!Number.isFinite(Number(artwork.scale)))return false;
 const normalized=normalizeArtworkForOption(artwork,option);
 return Math.abs(normalized.x-Number(artwork.x))<=tolerance&&Math.abs(normalized.y-Number(artwork.y))<=tolerance&&Math.abs(normalized.scale-Number(artwork.scale))<=tolerance;
}

export function validateArtworkLayers(artworks=[],option={}){
 for(const artwork of artworks){
  if(!artwork?.logo?.id)return 'En logofil mangler.';
  const normalized=normalizeArtworkForOption(artwork,option),size=artworkPrintSize(normalized,option);
  if(size.widthFraction>1.0001||size.heightFraction>1.0001)return `${artwork.logo.name||'Et logo'} er større end trykfladen.`;
  if(!artworkFitsOption(artwork,option))return `${artwork.logo.name||'Et logo'} ligger uden for trykfladen.`;
  const halfWidth=size.widthFraction/2,halfHeight=size.heightFraction/2;
  if(normalized.x-halfWidth<0||normalized.x+halfWidth>1||normalized.y-halfHeight<0||normalized.y+halfHeight>1)return `${artwork.logo.name||'Et logo'} ligger uden for trykfladen.`;
 }
 return '';
}

export function overallArtworkPreflight(results=[],hasText=false){
 const checks=results.filter(Boolean);
 if(!checks.length)return hasText?{status:'approved',label:'Tekst klar',checks:['Teksten kontrolleres igen i den endelige korrektur.']}:{status:'missing',label:'Mangler design',checks:['Upload mindst ét logo eller tilføj tekst.']};
 if(checks.some(result=>result.status==='rejected'))return {status:'rejected',label:'Logo skal udskiftes',checks:checks.flatMap(result=>result.checks||[])};
 if(checks.some(result=>result.status==='review'))return {status:'review',label:'Kræver filkontrol',checks:checks.flatMap(result=>result.checks||[])};
 return {status:'approved',label:checks.length>1?'Logoer godkendt':'Logo godkendt',checks:checks.flatMap(result=>result.checks||[])};
}
