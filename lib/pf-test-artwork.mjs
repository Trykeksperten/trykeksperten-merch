import {requiredOrderMockup} from './order-mockups.mjs';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
const pathFor=id=>{if(!/^test-[a-f0-9-]{36}$/.test(id))throw Error('Ugyldig testreference.');return dataPath('pf-test-artwork',`${id}.json`);};
export async function readTestArtwork(id){return JSON.parse(await readFile(pathFor(id),'utf8'));}
export async function saveTestArtwork(record){const path=pathFor(record.id);await mkdir(dataPath('pf-test-artwork'),{recursive:true,mode:0o700});const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(record),{mode:0o600});await rename(temporary,path);}

export async function readTestOrderMockup(order,lineIndex,decorationIndex){
 if(order.checkoutId||order.gatewayPayload?.Header?.isTest!==true)throw Error('Ikke en PF-testordre.');
 const source=order.lines?.[lineIndex]?.decorations?.[decorationIndex]?.files?.proof;
 if(!source)throw Error('Mockup findes ikke.');
 const url=new URL(source),id=url.searchParams.get('checkout');
 if(url.searchParams.get('artwork')!==`mockup-${lineIndex}-${decorationIndex}`)throw Error('Mockup matcher ikke placeringen.');
 const record=await readTestArtwork(id);
 if(record.orderId!==order.id)throw Error('Mockup matcher ikke ordren.');
 return Buffer.from(requiredOrderMockup(record,lineIndex,decorationIndex).base64,'base64');
}
