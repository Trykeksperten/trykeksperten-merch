import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
export const automationDefaults={shipmentMail:'review',supplierCustomerMail:'unknown',proofPublication:'review',proofReminders:true,confirmationMail:'automatic',decisionReceipt:'automatic',staffDecisionMail:'automatic'};
export async function automationSettings(){try{return {...automationDefaults,...JSON.parse(await readFile(dataPath('automation-settings.json'),'utf8'))};}catch(e){if(e.code==='ENOENT')return {...automationDefaults};throw e;}}
export async function saveAutomationSettings(input){
 input={...automationDefaults,...input};const value={};for(const key of ['shipmentMail','proofPublication','confirmationMail','decisionReceipt','staffDecisionMail']){if(!['review','automatic'].includes(input[key]))throw Error('Vælg automatisk eller gennemgang.');value[key]=input[key];}
 if(!['unknown','disabled','enabled'].includes(input.supplierCustomerMail))throw Error('Angiv PF’s kundekommunikation.');
 value.supplierCustomerMail=input.supplierCustomerMail;if(typeof input.proofReminders!=='boolean')throw Error('Vælg påmindelser til eller fra.');value.proofReminders=input.proofReminders;
 if(value.shipmentMail==='automatic'&&value.supplierCustomerMail!=='disabled')throw Error('Afklar og deaktivér PF’s direkte kundemails før automatisk forsendelsesmail aktiveres.');
 value.updatedAt=new Date().toISOString();await mkdir(dataPath(),{recursive:true,mode:0o700});const temp=dataPath('automation-settings-'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,dataPath('automation-settings.json'));return value;
}
