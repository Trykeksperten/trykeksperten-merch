import {englishUI} from './english-ui.mjs';
const normalize=text=>String(text).replace(/\s+/g,' ').trim();
let phrases=new Map(Object.entries(englishUI)),pattern,language='da';
const escapeRegExp=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function compile(){
 // Long product descriptions are exact-match only. Short phrases may appear
 // inside variant labels, titles or dynamically generated summaries.
 const keys=[...phrases.keys()].filter(key=>key.length<=250).sort((a,b)=>b.length-a.length);
 pattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+keys.map(escapeRegExp).join('|')+')(?![\\p{L}\\p{N}])','gu');
}
compile();
export const getLanguage=()=>language;
export function setLanguage(value){language=value==='en'?'en':'da';}
export function installProductTranslations(entries){phrases=new Map([...Object.entries(entries),...Object.entries(englishUI)]);compile();}
export function translate(text,locale=language){
 if(locale!=='en'||typeof text!=='string'||!text.trim())return text;
 const source=normalize(text),exact=phrases.get(source);
 if(exact)return text.match(/^\s*/)[0]+exact+text.match(/\s*$/)[0];
 return text.replace(pattern,match=>phrases.get(match)||match).replace(/(?<![\d+])1 items\b/g,'1 item').replace(/(?<![\d+])1 colours\b/g,'1 colour').replace(/(?<![\d+])1 positions\b/g,'1 position');
}
