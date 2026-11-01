import {defaultTextPlacement,fontFamily} from './pf-text.mjs?v=5';

// All dimensions are in the caller's physical coordinate system (normally mm).
// Glyph height estimates are independent of baseline-to-baseline line spacing.
export function textPreviewLayout(ctx,text,placement,size){
 const style={...defaultTextPlacement(),...placement},lines=String(text).trim().split(/\r?\n/);
 const fontStyle=(style.italic?'italic ':'')+(style.bold?'700 ':'400 '),family=fontFamily(style.font),spacing=style.lineSpacing,gap=style.letterSpacing||0;
 ctx.font=fontStyle+'100px '+family;
 const measured=Math.max(1,...lines.map(line=>ctx.measureText(line||' ').width+Math.max(0,Array.from(line).length-1)*gap*100));
 const fontSize=Math.min(size.widthMm*100/measured,size.heightMm/(.82+(lines.length-1)*spacing));
 return {style,lines,font:fontStyle+fontSize+'px '+family,fontSize,gap:gap*fontSize,baselineStep:fontSize*spacing};
}
export function drawTextPreview(ctx,text,placement,size,color){
 const layout=textPreviewLayout(ctx,text,placement,size),{style,lines,font,fontSize,gap,baselineStep}=layout;
 ctx.font=font;ctx.fillStyle=color;ctx.textAlign=style.align;ctx.textBaseline='middle';
 const x=style.align==='left'?-size.widthMm/2:style.align==='right'?size.widthMm/2:0;
 for(const [i,line]of lines.entries()){
  const y=(i-(lines.length-1)/2)*baselineStep,chars=Array.from(line),width=ctx.measureText(line).width+Math.max(0,chars.length-1)*gap,left=x-(style.align==='left'?0:style.align==='right'?width:width/2);
  if(style.underline&&line)ctx.fillRect(left,y+fontSize*.43,width,Math.max(fontSize*.05,.1));
  if(!gap){ctx.fillText(line,x,y);continue;}
  let cursor=left;ctx.save();ctx.textAlign='left';
  for(const char of chars){ctx.fillText(char,cursor,y);cursor+=ctx.measureText(char).width+gap;}
  ctx.restore();
 }
 return layout;
}
