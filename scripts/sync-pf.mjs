// Read-only download of public feeds. No price, stock or order endpoints.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'tryk-pf-'));
try{
 for(const name of ['productfeed_dk_v3','productfeedws_dk_v3','printdata_cse1_dk_v3','printdata_cse1_dk_label_v3','printdataws_cse1_dk_v3']){
  const response=await fetch(`https://www.pfconcept.com/portal/datafeed/${name}.json`,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
  const data=await response.json();await writeFile(join(directory,`${name}.json`),JSON.stringify(data));
 }
 const result=spawnSync(process.execPath,['scripts/import-pf.mjs',directory],{stdio:'inherit'});if(result.status!==0)throw Error('Import failed; previous catalog retained.');
}finally{await rm(directory,{recursive:true,force:true});}
