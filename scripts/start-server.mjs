import {loadEnvFile} from 'node:process';
try{loadEnvFile();}catch(error){if(error.code!=='ENOENT')throw error;}
import {prepareRenderBackupFiles} from '../lib/render-backup-secrets.mjs';
let prepared;
try{prepared=await prepareRenderBackupFiles(process.env);}
catch{console.error(JSON.stringify({event:'backup_secret_preparation_failed',code:'BACKUP_SECRET_PREPARATION_FAILED'}));process.exit(1);}
if(prepared.prepared){
 process.env.SMERCH_BACKUP_CERTIFICATE=prepared.environment.SMERCH_BACKUP_CERTIFICATE;
 process.env.SMERCH_BACKUP_CREDENTIALS=prepared.environment.SMERCH_BACKUP_CREDENTIALS;
}
await import('../server.mjs');
