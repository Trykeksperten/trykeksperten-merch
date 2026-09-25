import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const localDataRoot=resolve(fileURLToPath(new URL('../.private/',import.meta.url)));

export function dataPath(...segments){
 const root=resolve(process.env.SMERCH_DATA_DIR||localDataRoot);
 return resolve(root,...segments);
}
