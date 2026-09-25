// A conservative preview check. Production separations still require artwork review.
export function estimateInkColors({data,width,height}){
 if(!data||!width||!height)return null;
 const buckets=new Map();let opaque=0;
 for(let i=0;i<data.length;i+=4){
  if(data[i+3]<224)continue;
  opaque++;
  const key=[0,1,2].map(channel=>Math.round(data[i+channel]/20)*20).join(',');
  buckets.set(key,(buckets.get(key)||0)+1);
 }
 if(!opaque)return null;
 const clusters=[];
 for(const [key,count] of [...buckets].sort((a,b)=>b[1]-a[1])){
  if(count<Math.max(3,opaque*.003))continue;
  const color=key.split(',').map(Number);
  const nearby=clusters.find(row=>Math.hypot(...color.map((value,index)=>value-row.color[index]))<45);
  if(nearby){const total=nearby.count+count;nearby.color=nearby.color.map((value,index)=>(value*nearby.count+color[index]*count)/total);nearby.count=total;}
  else clusters.push({color,count});
 }
 return Math.max(1,clusters.filter(row=>row.count>=Math.max(8,opaque*.012)).length);
}

export async function inspectLogoColors(file){
 if(!/^image\/(png|jpeg|svg\+xml)$/.test(file?.type||''))return null;
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
  const ratio=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const context=canvas.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
  return estimateInkColors(context.getImageData(0,0,canvas.width,canvas.height));
 }catch{return null;}finally{URL.revokeObjectURL(url);}
}
