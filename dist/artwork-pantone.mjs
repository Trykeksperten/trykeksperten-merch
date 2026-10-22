export async function readArtworkPantone(file){
 try{
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
  const response=await fetch('/api/artwork/pantone',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64})});
  if(!response.ok)throw Error();return await response.json();
 }catch{return {status:'manual',codes:[]};}
}
export function pantoneLabel(analysis){
 const codes=analysis?.codes?.map(code=>`PANTONE ${code}`).join(', ');
 return analysis?.status==='verified'&&codes?`Spotfarver læst fra originalfilen: ${codes}.`:
  codes?`Farvenavne fundet: ${codes}. Kræver manuel kontrol af, hvilke farver der bruges.`:
  'Ingen sikre Pantone-koder aflæst. Trykfarver afklares manuelt, hvis trykmetoden kræver Pantone.';
}
