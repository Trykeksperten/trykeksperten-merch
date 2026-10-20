export function createArtworkPreviewLoader({loadFile,createVectorPreview}){
 const pending=new Map();
 return async logo=>{
  const key=`${logo.id}:${logo.previewId||''}`;
  if(!pending.has(key))pending.set(key,(async()=>{
   if(logo.previewId){const preview=await loadFile(logo.previewId);if(preview?.type?.startsWith('image/'))return preview;}
   const original=await loadFile(logo.id);if(!original)return null;
   return original.type?.startsWith('image/')?original:await createVectorPreview(original);
  })().catch(error=>{pending.delete(key);throw error;}));
  const file=await pending.get(key);if(!file)pending.delete(key);return file;
 };
}
export function retainLocalPreviews(checked,source){
 const logos=new Map((source.decorations||[]).flatMap(d=>(d.artworks||[]).map(a=>a.logo)).map(logo=>[logo.id,logo]));
 const restore=logo=>{const local=logos.get(logo?.id);return local?.previewId?{...logo,previewId:local.previewId,previewType:local.previewType}:logo;};
 return {...checked,decorations:checked.decorations.map(d=>({...d,logo:d.logo?restore(d.logo):null,artworks:(d.artworks||[]).map(a=>({...a,logo:restore(a.logo)}))}))};
}

export function nextPendingPlacement(choices,needsSaving,after=-1){
 const next=choices.findIndex((choice,index)=>index>after&&needsSaving(choice));
 return next>=0?next:choices.findIndex(needsSaving);
}
