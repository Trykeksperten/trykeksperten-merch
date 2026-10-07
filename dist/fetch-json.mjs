// Retry only read requests; never repeat order creation or message submission.
export async function fetchJSON(url,{timeout=12000,retries=1,fetchImpl=fetch}={}){
 for(let attempt=0;attempt<=retries;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  let retryable=true;
  try{
   const response=await fetchImpl(url,{signal:controller.signal});
   if(!response.ok){retryable=response.status===408||response.status===429||response.status>=500;throw Error('Oplysningerne kunne ikke hentes. Prøv igen.');}
   return await response.json();
  }catch(error){
   if(!retryable||attempt===retries)throw Error(controller.signal.aborted?'Forbindelsen tog for lang tid. Prøv igen.':error.message||'Forbindelsen blev afbrudt. Prøv igen.');
  }finally{clearTimeout(timer);}
 }
}
