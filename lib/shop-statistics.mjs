import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
const types=new Set(['page_view','cart_add','cart_remove','cart_empty']);
const pages=new Set(['home','products','product','cart','checkout','about','contact','brands','special']);
const timeFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
export function normalizeStatisticsEvent(input){
 if(!types.has(input?.type))throw Error('Ugyldig hændelse.');
 if(input.type==='page_view'){if(!pages.has(input.page))throw Error('Ugyldig sidetype.');return {type:input.type,page:input.page};}
 if(input.type==='cart_empty')return {type:input.type};
 if(!Number.isInteger(input.units)||input.units<1||input.units>2000000)throw Error('Ugyldigt antal.');
 return {type:input.type,units:input.units};
}
const empty=()=>({events:{},units:{},pages:{}});
async function read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1,startedAt:null,hours:{}};throw error;}}
let pending=Promise.resolve();
export function recordStatistics(events,{path=dataPath('shop-statistics.json'),now=Date.now()}={}){
 if(!Array.isArray(events)||!events.length||events.length>6)throw Error('Ugyldigt antal hændelser.');
 const safe=events.map(normalizeStatisticsEvent);
 const job=pending.then(async()=>{const state=await read(path),key=new Date(now).toISOString().slice(0,13),row=state.hours[key]||empty();
 state.startedAt||=new Date(now).toISOString();
 for(const event of safe){row.events[event.type]=(row.events[event.type]||0)+1;if(event.units)row.units[event.type]=(row.units[event.type]||0)+event.units;if(event.page)row.pages[event.page]=(row.pages[event.page]||0)+1;}
 state.hours[key]=row;const cutoff=now-90*86400000;for(const hour of Object.keys(state.hours))if(Date.parse(hour+':00:00Z')<cutoff)delete state.hours[hour];
 await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,path);
 });pending=job.catch(()=>{});return job;
}
export async function statisticsReport({path=dataPath('shop-statistics.json'),days=7,now=Date.now()}={}){
 if(![1,7,30,90].includes(days))throw Error('Vælg 1, 7, 30 eller 90 dage.');
 await pending;const state=await read(path),dates=[];
 const today=timeFormat.format(new Date(now)).slice(0,10);
 for(let offset=days-1;offset>=0;offset--){const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-offset);dates.push(date.toISOString().slice(0,10));}
 const daily=new Map(dates.map(date=>[date,{date,views:0,adds:0,removes:0}])),hourly=Array.from({length:24},(_,hour)=>({hour,views:0})),totals=empty();
 for(const [hour,row]of Object.entries(state.hours)){const local=timeFormat.format(new Date(hour+':00:00Z')),date=local.slice(0,10),day=daily.get(date);if(!day)continue;
 for(const field of ['events','units','pages'])for(const [name,count]of Object.entries(row[field]))totals[field][name]=(totals[field][name]||0)+count;
 const views=row.events.page_view||0;day.views+=views;day.adds+=row.events.cart_add||0;day.removes+=row.events.cart_remove||0;hourly[Number(local.slice(11,13))].views+=views;
 }
 return {days,from:dates[0],to:today,timeZone:'Europe/Copenhagen',startedAt:state.startedAt,retentionDays:90,totals,daily:[...daily.values()],hourly};
}
