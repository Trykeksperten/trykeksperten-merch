import {loadEnvFile} from 'node:process';
import {pfReadiness} from '../lib/pf-readiness.mjs';

try{loadEnvFile();}catch(error){if(error.code!=='ENOENT')throw error;}

const report=pfReadiness();
console.log('PF-integration – sikker statuskontrol');
console.log(`Gateway-mode: ${report.mode}`);
for(const check of report.checks)console.log(`${check.ready?'✓':'○'} ${check.label} [${check.source}]`);
console.log('');
for(const [name,label] of [['gatewayTest','Gateway-test'],['endToEndTest','Komplet testflow'],['live','Live']]){
 const phase=report.phases[name];console.log(`${phase.ready?'KLAR':'MANGLER'}: ${label}`);
 if(!phase.ready)for(const item of phase.missing)console.log(`  - ${item}`);
}
console.log('\nIngen nøgler eller adgangskoder er blevet vist.');
