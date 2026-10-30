import {importLegacy} from '../lib/backoffice/migration.mjs';
import {closeDatabases} from '../lib/backoffice/database.mjs';
try{console.log(JSON.stringify(await importLegacy({dryRun:process.argv.includes('--dry-run')})));}catch{console.error('Migration afbrudt. Kontrollér datavalidering og backup. Ingen delvis import er gemt.');process.exitCode=1;}finally{closeDatabases();}
