import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
const pathFor=id=>{if(!/^test-[a-f0-9-]{36}$/.test(id))throw Error('Ugyldig testreference.');return dataPath('pf-test-artwork',`${id}.json`);};
export async function readTestArtwork(id){return JSON.parse(await readFile(pathFor(id),'utf8'));}
export async function saveTestArtwork(record){const path=pathFor(record.id);await mkdir(dataPath('pf-test-artwork'),{recursive:true,mode:0o700});const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(record),{mode:0o600});await rename(temporary,path);}
