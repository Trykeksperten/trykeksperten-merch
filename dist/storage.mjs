const db = new Promise((resolve,reject)=>{const request=indexedDB.open('trykeksperten-merch',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export async function saveFile(file,{preview=false}={}){
 if(file.size>5*1024*1024)throw Error('Logoet må højst fylde 5 MB.');
 const bytes=new Uint8Array(await file.slice(0,256).arrayBuffer()),head=new TextDecoder().decode(bytes),extension=(file.name.split('.').pop()||'').toLowerCase();
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const pdf=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
 const eps=extension==='eps'&&head.startsWith('%!PS'),ai=extension==='ai'&&(pdf||head.startsWith('%!PS')),cdr=extension==='cdr'&&head.startsWith('RIFF')&&head.includes('CDR');
 if(preview?!(extension==='png'&&png):!(extension==='pdf'&&pdf)&&!eps&&!ai&&!cdr)throw Error(preview?'Forhåndsvisningen er ugyldig.':'Vælg en EPS-, CDR-, PDF- eller AI-fil.');
 const id=crypto.randomUUID(),database=await db;
 await new Promise((resolve,reject)=>{const tx=database.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 return {id,name:file.name,size:file.size,type:preview?'image/png':eps?'application/postscript':cdr?'application/vnd.corel-draw':ai?'application/illustrator':'application/pdf'};
}
export async function loadFile(id){const database=await db;return new Promise((resolve,reject)=>{const r=database.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function deleteFile(id){const database=await db;return new Promise((resolve,reject)=>{const tx=database.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
