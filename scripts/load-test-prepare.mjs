// Synthetic acceptance fixtures only. Never read .env, .private or order records.
import {mkdir,copyFile,writeFile,symlink,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {PDFDocument,StandardFonts,pushGraphicsState,popGraphicsState,concatTransformationMatrix,drawObject} from 'pdf-lib';
import {deflateSync} from 'node:zlib';
const source=fileURLToPath(new URL('../',import.meta.url)),root=resolve(process.argv[2]||'');
if(!process.argv[2]||root===resolve(source)||root.startsWith(resolve(source,'.private')+'/'))throw Error('Choose a new synthetic workspace.');
await mkdir(root,{recursive:false,mode:0o700});
const app=join(root,'app'),fixtures=join(root,'fixtures'),runtime=join(root,'runtime');
await Promise.all([mkdir(app),mkdir(fixtures),mkdir(runtime)]);
const selected=execFileSync('git',['ls-files','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(f=>/^(lib|dist|config|data|migrations|scripts)\//.test(f)||['server.mjs','package.json','package-lock.json'].includes(f));
for(const f of new Set([...selected,'scripts/load-test-prepare.mjs','scripts/load-test.mjs','scripts/load-test-server.mjs'])){const out=join(app,f);await mkdir(dirname(out),{recursive:true});await copyFile(join(source,f),out);}
await symlink(await realpath(join(source,'node_modules')),join(app,'node_modules'),'dir');
async function fixture(name,{pages=1,dense=false,large=false}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 let image;
 if(dense){const w=1024,h=768,rgb=Buffer.alloc(w*h*3);let seed=123456789;for(let i=0;i<rgb.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;rgb[i]=seed&255;}image=pdf.context.register(pdf.context.stream(deflateSync(rgb),{Type:'XObject',Subtype:'Image',Width:w,Height:h,ColorSpace:'DeviceRGB',BitsPerComponent:8,Filter:'FlateDecode'}));}
 for(let i=0;i<pages;i++){const page=pdf.addPage(large?[1320,1320]:[595,842]);page.drawText('Synthetic load proof '+i,{font,size:12,x:30,y:large?1200:800});if(image){const key=page.node.newXObject('Synthetic',image);page.pushOperators(pushGraphicsState(),concatTransformationMatrix(500,0,0,700,40,40),drawObject(key),popGraphicsState());}}
 await writeFile(join(fixtures,name+'.pdf'),await pdf.save());
}
await fixture('normal');await fixture('multi',{pages:8});await fixture('dense',{dense:true});await fixture('large',{large:true});await fixture('pages',{pages:41});
await writeFile(join(fixtures,'invalid.pdf'),'%PDF-invalid-synthetic');
await writeFile(join(fixtures,'oversized.pdf'),Buffer.alloc(16*1024*1024,32));
// Prevent the background popularity refresher from attempting a vendor fetch.
const popularity=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';console.log(fs.readFileSync('data/pf-popularity.json','utf8'))"],{cwd:source,encoding:'utf8',maxBuffer:2*1024*1024}));
popularity.updatedAt=new Date().toISOString();await writeFile(join(runtime,'pf-popularity.json'),JSON.stringify(popularity));
const manifest={syntheticOnly:true,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),createdAt:new Date().toISOString()};
await writeFile(join(root,'synthetic-load.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({prepared:true,root,sourceCommit:manifest.sourceCommit}));
