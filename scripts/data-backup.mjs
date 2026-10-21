import {createBackup,verifyBackup,restoreBackup} from '../lib/data-backup.mjs';
const [mode,source,target,...extra]=process.argv.slice(2);
try{
 if(!['create','verify','restore'].includes(mode)||!source||(mode!=='verify'&&!target))throw Error('Brug: node scripts/data-backup.mjs create KILDE NY_BACKUP --writes-paused | verify BACKUP | restore BACKUP NY_MAPPE');
 if(mode==='create'&&!extra.includes('--writes-paused'))throw Error('Stop serverens skrivninger før backup. Bekræft med --writes-paused. Lukket checkout stopper ikke callbacks og baggrundsjob.');
 const result=mode==='create'?await createBackup(source,target):mode==='restore'?await restoreBackup(source,target):await verifyBackup(source);
 console.log(`${mode}: OK · ${result.files??result.entries.filter(e=>e.type==='file').length} filer kontrolleret. Ingen kundeoplysninger udskrevet.`);
}catch(error){console.error(error.message);process.exitCode=1;}
