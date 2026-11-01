import {mkdir,open} from 'node:fs/promises';
import {dataPath} from './data-path.mjs';

// Retain the claim after success or failure. A crash, lost provider response or
// failed checkout save must never turn an attempted POST into a fresh attempt.
export async function claimPaymentOperation(id,attempt,operation,details={}){
 if(!/^pay-[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(attempt)||attempt<0||!['quickpay-create','quickpay-link','quickpay-renew','quickpay-renew-cancel'].includes(operation))throw Error('Ugyldigt betalingsforsøg.');
 const directory=dataPath('payment-operation-claims');await mkdir(directory,{recursive:true,mode:0o700});
 let handle;
 try{handle=await open(dataPath('payment-operation-claims',`${id}-${attempt}-${operation}.json`),'wx',0o600);}
 catch(error){if(error.code==='EEXIST')throw Error('Betalingsforsøget er allerede startet og kræver afstemning før nyt forsøg.');throw error;}
 try{await handle.writeFile(JSON.stringify({id,attempt,operation,requestedAt:new Date().toISOString(),...details}));await handle.sync();}
 finally{await handle.close();}
}
