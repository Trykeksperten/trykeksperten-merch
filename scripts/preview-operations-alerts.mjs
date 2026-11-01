// Explicit offline preview only: no SMTP, HTTP, application imports or .env loading.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {evaluateOperationsAlerts} from '../lib/operations-alerts.mjs';
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--input'||args[2]!=='--state')throw Error('Usage: node scripts/preview-operations-alerts.mjs --input snapshot.json --state local-state.json');
const input=resolve(args[1]),stateFile=resolve(args[3]);
if(input===stateFile)throw Error('Input and state paths must differ');
const snapshot=JSON.parse(await readFile(input,'utf8'));
let previous=null;try{previous=JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Monitor state could not be read; existing state preserved');}
const result=evaluateOperationsAlerts({snapshot,previous});
await mkdir(dirname(stateFile),{recursive:true,mode:0o700});
const temp=stateFile+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(result.state)+'\n',{mode:0o600,flag:'wx'});await rename(temp,stateFile);
console.log(JSON.stringify({delivery:'disabled',events:result.events,duplicate:result.duplicate}));
