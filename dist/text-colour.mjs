import {pantoneReferences} from './pantone-reference.mjs';
export function pantoneColour(value){
 const code=String(value||'').trim().replace(/^(?:pantone|pms)\s*/i,'').replace(/\s+/g,' ').toUpperCase().replace(/^(\d{3,4})\s*C?$/,'$1 C');
 const row=pantoneReferences.find(([name])=>name.toUpperCase()===code);
 return row?{model:'pantone',code:row[0],hex:row[1].toLowerCase()}:null;
}
export function cmykToHex(values){
 if(!Array.isArray(values)||values.length!==4||values.some(v=>v===''||v===null||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>100))return null;
 const [c,m,y,k]=values.map(v=>Number(v)/100);
 return '#'+[c,m,y].map(v=>Math.round(255*(1-v)*(1-k)).toString(16).padStart(2,'0')).join('');
}
export function hexToCmyk(hex){
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),k=1-Math.max(r,g,b);
 return k===1?[0,0,0,100]:[...( [r,g,b].map(v=>(1-v-k)/(1-k)*100)),k*100].map(v=>Math.round(v*10)/10);
}
export function cleanTextColour(spec,hex){
 if(!spec)return null;
 if(spec.model==='pantone'){const colour=pantoneColour(spec.code);return colour?.hex===hex.toLowerCase()?colour:null;}
 if(spec.model==='cmyk'&&cmykToHex(spec.values)===hex.toLowerCase())return {model:'cmyk',values:spec.values.map(Number),hex:hex.toLowerCase()};
 return null;
}
