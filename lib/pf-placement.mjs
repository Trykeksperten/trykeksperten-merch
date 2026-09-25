const number=value=>Number.parseFloat(value);

export function parsePFPlacementSVG(svg=''){
 const root=String(svg).match(/<svg\b[^>]*>/i)?.[0]||'';
 const viewBox=root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/).map(number);
 let canvasWidth=number(root.match(/\bwidth\s*=\s*["']([\d.]+)/i)?.[1]);
 let canvasHeight=number(root.match(/\bheight\s*=\s*["']([\d.]+)/i)?.[1]);
 if(viewBox?.length===4&&viewBox.every(Number.isFinite)){canvasWidth=viewBox[2];canvasHeight=viewBox[3];}
 if(!(canvasWidth>0&&canvasHeight>0))throw Error('PF-filen mangler et gyldigt koordinatsystem.');
 const path=[...String(svg).matchAll(/<path\b[\s\S]*?<\/path>/gi)].map(match=>match[0]).find(tag=>/#00ff00|rgb\s*\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(tag));
 if(!path)throw Error('PF-filen mangler en markeret trykflade.');
 const data=path.match(/\bd\s*=\s*["']([^"']+)["']/i)?.[1],values=data?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(number)||[];
 if(values.length<4||values.length%2)throw Error('PF-trykfladen kunne ikke aflæses.');
 const xs=[],ys=[];for(let index=0;index<values.length;index+=2){xs.push(values[index]);ys.push(values[index+1]);}
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 if(![left,right,top,bottom].every(Number.isFinite)||right<=left||bottom<=top)throw Error('PF-trykfladen er ugyldig.');
 return {x:left/canvasWidth,y:top/canvasHeight,width:(right-left)/canvasWidth,height:(bottom-top)/canvasHeight,source:'svg'};
}

export function stripPFPlacementGuide(svg=''){
 return String(svg).replace(/<path\b[\s\S]*?<\/path>/gi,tag=>/#00ff00|rgb\s*\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(tag)?'':tag);
}
