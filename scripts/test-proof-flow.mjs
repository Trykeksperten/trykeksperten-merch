import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataPath} from '../lib/data-path.mjs';
import {assertAdminCheckoutTest} from '../lib/admin-checkout-test.mjs';
import {readCheckout,persistCheckout} from '../lib/checkout.mjs';
import {recordProof,publishCustomerProof} from '../lib/pf-orders.mjs';
import {proofMailConfiguration,retryProofMail} from '../lib/proof-mail.mjs';
// Explicit operator command. Creates isolated test records, never a supplier order.
try{
 assertAdminCheckoutTest(true);
 const [sourceId,to,...rest]=process.argv.slice(2);
 if(rest.length||!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('Brug: node scripts/test-proof-flow.mjs testordre-id modtager-email');
 if(!proofMailConfiguration().ready)throw Error('Korrekturmail er ikke konfigureret.');
 const source=await readCheckout(sourceId);
 if(source.adminTest!==true||source.status!=='authorized'||!source.mockups?.length)throw Error('Vælg en godkendt administratortest med mockup.');
 const checkout={id:'pay-'+randomUUID(),adminTest:true,status:'authorized',createdAt:new Date().toISOString(),lines:source.lines,productNames:source.productNames,shipping:{email:to},pfOrderIds:[],events:[]};
 await persistCheckout(checkout);await mkdir(dataPath('orders'),{recursive:true,mode:0o700});
 const orderIds=[];
 for(const [scenario,message] of [['AENDRINGER','TEST 1: Åbn billedet. Vælg “Bed om ændringer” og skriv: Flyt logoet lidt op.'],['GODKENDELSE','TEST 2: Åbn billedet. Bekræft gennemgang, og vælg “Godkend til produktion”. Dette er kun en test; produktion er permanent blokeret.']]){
  const id='ord-'+randomUUID(),now=new Date().toISOString();
  await writeFile(dataPath('orders',id+'.json'),JSON.stringify({id,adminTest:true,checkoutId:checkout.id,purchaseOrderNumber:'TEST-'+scenario,status:'awaiting_proof',createdAt:now,updatedAt:now,lines:source.lines,events:[]}),{flag:'wx',mode:0o600});
  orderIds.push(id);
  await recordProof(id,{proofReference:'TEST-MOCKUP',mimeType:'image/png',contentBase64:source.mockups[0].base64});
  await publishCustomerProof(id,{version:1,message});
  console.log(`Korrekturtest oprettet: ${scenario} (${id})`);
 }
 await retryProofMail({orderIds});console.log('Kontrollér modtagerens indbakke for to korrekturtests. Testbilledet er et mockup, ikke en PF-produktionskorrektur.');
}catch(error){console.error(error.message);process.exitCode=1;}
