import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readdir,lstat,realpath,copyFile,chmod,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
const hash=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
async function inventory(root,prefix=''){
 const entries=[];
 for(const name of (await readdir(resolve(root,prefix))).sort()){
  const path=prefix?prefix+'/'+name:name,full=resolve(root,path),stat=await lstat(full);
  if(stat.isDirectory())entries.push({path,type:'directory'},...await inventory(root,path));
  else if(stat.isFile())entries.push({path,type:'file',bytes:stat.size,sha256:await hash(full)});
  else throw Error('Backup afviser symbolske links og særlige filer.');
 }
 return entries;
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function newTarget(source,target){
 source=await realpath(source);target=resolve(target);
 const parent=await realpath(dirname(target));target=resolve(parent,target.split(sep).at(-1));
 const rel=relative(source,target);if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep)))throw Error('Destination skal ligge uden for kildemappen.');
 await mkdir(target,{mode:0o700});return target;
}
async function copyTree(source,target,entries){
 for(const entry of entries){const full=resolve(target,entry.path);if(entry.type==='directory')await mkdir(full,{mode:0o700});else{await copyFile(resolve(source,entry.path),full);await chmod(full,0o600);}}
}
export async function createBackup(source,target){
 source=await realpath(source);const before=await inventory(source);target=await newTarget(source,target);
 await mkdir(resolve(target,'data'),{mode:0o700});await copyTree(source,resolve(target,'data'),before);
 if(!same(before,await inventory(source))||!same(before,await inventory(resolve(target,'data'))))throw Error('Data ændrede sig under kopiering. Backup er ufuldstændig og må ikke anvendes.');
 await writeFile(resolve(target,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),entries:before},null,2),{mode:0o600,flag:'wx'});
 return {files:before.filter(e=>e.type==='file').length};
}
export async function verifyBackup(source){
 const manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.entries)||!same(manifest.entries,await inventory(resolve(source,'data'))))throw Error('Backup mangler filer eller har ændret indhold.');
 return manifest;
}
export async function restoreBackup(source,target){
 const manifest=await verifyBackup(source);target=await newTarget(source,target);
 await copyTree(resolve(source,'data'),target,manifest.entries);
 if(!same(manifest.entries,await inventory(target)))throw Error('Gendannelsen kunne ikke verificeres.');
 return {files:manifest.entries.filter(e=>e.type==='file').length};
}
