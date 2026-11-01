import {AsyncLocalStorage} from 'node:async_hooks';

// One checkout and its PF groups share a mutation boundary. Staff proof approval
// may call capture while already holding it, so nested calls must be reentrant.
const pending=new Map(),ownership=new AsyncLocalStorage();
export async function withOrderAggregateLock(key,task){
 const inherited=ownership.getStore(),held=inherited?.get(key);
 if(held?.active)return task();
 const previous=pending.get(key)||Promise.resolve();
 let release;const current=new Promise(resolve=>{release=resolve;});pending.set(key,current);
 await previous;
 const lease={active:true},context=new Map(inherited);context.set(key,lease);
 try{return await ownership.run(context,task);}
 finally{
  // Detached descendants keep their async context; it must not remain a permit
  // to bypass a later owner's lock once this operation has finished.
  lease.active=false;release();if(pending.get(key)===current)pending.delete(key);
 }
}
