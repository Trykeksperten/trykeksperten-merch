import {readFile,realpath} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {dataPath} from './data-path.mjs';

export function checkoutArtworkReference(orderId,index){
 if(!/^(?:pay|test)-[a-f0-9-]{36}$/.test(orderId||'')||!Number.isSafeInteger(index)||index<0)throw Error('Ugyldig trykfilreference.');
 return `checkouts/${orderId}/${index}`;
}

export async function readCheckoutArtwork(orderId,asset){
 const stored=asset?.path;
 if(typeof stored!=='string')throw Error('Trykfilens reference mangler.');
 // Older records contain the original data directory. Only reuse the checkout
 // suffix, so a restored order always reads the copied file in the active root.
 const reference=isAbsolute(stored)?stored.match(/\/(checkouts\/(?:pay|test)-[a-f0-9-]{36}\/(?:0|[1-9]\d*))$/)?.[1]:stored;
 const index=reference?.split('/').at(-1);
 if(!index||reference!==checkoutArtworkReference(orderId,Number(index)))throw Error('Ugyldig trykfilreference.');
 const root=await realpath(dataPath()),expected=resolve(root,reference),actual=await realpath(expected);
 // Backup already rejects symlinks; keep reads bound to this checkout's file.
 if(actual!==expected)throw Error('Trykfilen ligger ikke i ordrens datamappe.');
 return readFile(actual);
}
