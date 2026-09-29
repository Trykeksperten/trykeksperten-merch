export async function readJSONResponse(response,message){
 let result;
 try{result=await response.json();}catch{throw Error(message);}
 if(!response.ok)throw Error(typeof result?.error==='string'?result.error:message);
 if(!result||typeof result!=='object'||Array.isArray(result))throw Error(message);
 return result;
}
