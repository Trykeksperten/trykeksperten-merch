import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackup,verifyBackup,restoreBackup} from '../lib/data-backup.mjs';
test('private order files and empty folders survive verified isolated restore; existing destinations never overwritten',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-backup-'));try{
 const source=join(root,'source'),backup=join(root,'backup'),restored=join(root,'restored');await mkdir(source);await mkdir(join(source,'empty'));await writeFile(join(source,'order.json'),'{"test":true}');
 assert.equal((await createBackup(source,backup)).files,1);await verifyBackup(backup);await restoreBackup(backup,restored);assert.equal(await readFile(join(restored,'order.json'),'utf8'),'{"test":true}');
 await assert.rejects(restoreBackup(backup,restored));await assert.rejects(createBackup(source,join(source,'nested')),/uden for/);
 await writeFile(join(backup,'data','order.json'),'changed');await assert.rejects(verifyBackup(backup),/ændret/);await assert.rejects(restoreBackup(backup,join(root,'bad')),/ændret/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('backup refuses links out of the private data tree',async()=>{const root=await mkdtemp(join(tmpdir(),'smerch-backup-'));try{await mkdir(join(root,'data'));await writeFile(join(root,'secret'),'x');await symlink(join(root,'secret'),join(root,'data','link'));await assert.rejects(createBackup(join(root,'data'),join(root,'copy')),/links/);}finally{await rm(root,{recursive:true,force:true});}});
