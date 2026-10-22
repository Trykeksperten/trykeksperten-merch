import {PDFDocument,PDFArray,PDFName,PDFDict,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
const name=value=>value instanceof PDFName?value.decodeText():'';
export function explicitPantone(value){
 const match=/^PANTONE\s+((?:\d{3,4}|[A-Za-z]+(?: [A-Za-z]+)*(?: \d{2,4})?)\s*C)$/i.exec(value.trim());
 return match?match[1].replace(/\s*C$/i,' C').replace(/\s+/g,' ').toUpperCase():null;
}
const manual=codes=>({version:1,status:'manual',codes:[...new Set(codes)].sort()});
// Deliberately narrow interpreter: no PostScript execution, image colour guessing,
// form XObjects, text, patterns or transparency. Those files retain manual review.
export async function parseArtworkPantone(bytes){
 const head=Buffer.from(bytes).subarray(0,8).toString('latin1');
 if(head.startsWith('%!PS')){
  const source=Buffer.from(bytes).toString('latin1'),codes=[];
  for(const line of source.split(/\r?\n/))if(/^%%(?:CMYKCustomColor|RGB CustomColor|RGBCustomColor|DocumentCustomColors):/.test(line)){
   for(const match of line.matchAll(/\(([^()]*)\)/g)){const code=explicitPantone(match[1]);if(code)codes.push(code);}
  }
  return manual(codes);
 }
 if(!head.startsWith('%PDF-'))return manual([]);
 const doc=await PDFDocument.load(bytes,{updateMetadata:false}),ctx=doc.context,candidates=[];
 const space=value=>{
  const array=ctx.lookup(value);if(!(array instanceof PDFArray)||name(array.get(0))!=='Separation')return null;
  return explicitPantone(name(ctx.lookup(array.get(1))));
 };
 for(const [,object] of ctx.enumerateIndirectObjects()){
  if(object instanceof PDFArray){const code=space(object);if(code)candidates.push(code);}
  const dict=object instanceof PDFRawStream?object.dict:object;
  if(dict instanceof PDFDict){const resources=ctx.lookup(dict.get(PDFName.of('Resources')));const colours=resources instanceof PDFDict?ctx.lookup(resources.get(PDFName.of('ColorSpace'))):null;
   if(colours instanceof PDFDict)for(const [,value] of colours.entries()){const code=space(value);if(code)candidates.push(code);}
  }
 }
 const result=manual(candidates);if(doc.getPageCount()!==1)return result;
 const page=doc.getPages()[0];if(page.node.Annots()?.size())return result;
 const resources=page.node.Resources(),colours=resources?.lookup(PDFName.of('ColorSpace'));
 if(!(colours instanceof PDFDict))return result;
 const contents=page.node.Contents(),streams=contents instanceof PDFArray?contents.asArray():[contents];let source='';
 for(const ref of streams){const stream=ctx.lookup(ref);if(!(stream instanceof PDFRawStream))return result;const decoded=decodePDFRawStream(stream).decode();if(decoded.length>2*1024*1024)return result;source+=Buffer.from(decoded).toString('latin1')+'\n';}
 // Tokenize every character: unsupported syntax cannot silently disappear.
 const tokens=source.replace(/%[^\r\n]*/g,'').match(/\/[^\s\[\]()<>/%{}]+|[-+]?(?:\d+\.?\d*|\.\d+)|[A-Za-z*']+|\S/g)||[];
 let state={fill:null,stroke:null},args=[],stack=[],used=new Set(),painted=false;
 const neutral=new Set(['m','l','c','v','y','h','re','n','W','W*','cm','w','J','j','M']);
 for(const token of tokens){
  if(token.startsWith('/')||/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(token)){args.push(token);continue;}
  if(token==='q'){stack.push({...state});}else if(token==='Q'){if(!stack.length)return result;state=stack.pop();}
  else if(token==='cs'||token==='CS'){if(args.length!==1||!args[0].startsWith('/'))return result;const key=PDFName.of(args[0].slice(1).replace(/#([\da-f]{2})/ig,(_,hex)=>String.fromCharCode(parseInt(hex,16))));state[token==='cs'?'fill':'stroke']=space(colours.get(key));}
  else if(token==='scn'||token==='SCN'){if(args.length!==1||!Number.isFinite(Number(args[0]))||Number(args[0])<0||Number(args[0])>1)return result;}
  else if(['g','rg','k'].includes(token))state.fill=null;
  else if(['G','RG','K'].includes(token))state.stroke=null;
  else if(['f','F','f*','S','s','B','B*','b','b*'].includes(token)){
   const fill=!['S','s'].includes(token),stroke=!['f','F','f*'].includes(token);
   if((fill&&!state.fill)||(stroke&&!state.stroke))return result;
   if(fill)used.add(state.fill);if(stroke)used.add(state.stroke);painted=true;
  }else if(!neutral.has(token))return result;
  args=[];
 }
 if(args.length||stack.length||!painted)return result;
 return {version:1,status:'verified',codes:[...used].sort()};
}
