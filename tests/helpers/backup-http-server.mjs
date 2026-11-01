// IPC controls exist only in this synthetic child-process harness, never in server.mjs.
import {backupRuntime} from '../../server.mjs';
let release;
process.on('message',async message=>{
 if(message==='freeze'){
  process.send({type:'freeze-started'});
  try{await backupRuntime.gate.exclusive(()=>new Promise(resolve=>{release=resolve;process.send({type:'frozen'});}));process.send({type:'thawed'});}catch{process.send({type:'freeze-failed'});}
 }
 if(message==='thaw')release?.();
 if(message==='state')process.send({type:'state',...backupRuntime.gate.snapshot()});
 if(message==='background')process.send({type:'background',result:await backupRuntime.runBackground(()=>{throw Error('must not start');})});
});
