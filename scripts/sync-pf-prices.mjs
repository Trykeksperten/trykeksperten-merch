import {loadEnvFile} from 'node:process';
import {syncPFFeeds} from '../lib/pf-feed-sync.mjs';
try{loadEnvFile();}catch(error){if(error.code!=='ENOENT')throw error;}
const result=await syncPFFeeds();
for(const [name,status] of Object.entries(result)){
 const label=name==='prices'?'Pris- og trykprisfeed':'Lagerfeed';
 if(status.ok)console.log(`${label} opdateret: ${status.productDate||status.updatedAt}${status.printDate?' / '+status.printDate:''}`);
 else console.error(`${label}: ${status.error}`);
}
if(Object.values(result).some(status=>!status.ok))process.exitCode=1;
