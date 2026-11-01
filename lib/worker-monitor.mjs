// Only fixed task identifiers and timestamps are exposed. Never log an exception
// message/body: provider errors can contain credentials or customer information.
export const workerNames=['proof_mailbox','sales_finance','withdrawal_receipts','order_confirmations','proof_mail','shipment_mail','economic_invoices'];
export function createWorkerMonitor({now=Date.now,log=row=>console.error(JSON.stringify(row))}={}){
 const states=new Map(workerNames.map(name=>[name,{name,running:false,lastStartedAt:null,lastFinishedAt:null,lastSucceededAt:null,lastFailedAt:null,consecutiveFailures:0}]));
 return {
  snapshot(){return [...states.values()].map(state=>({...state}));},
  async run(name,task){
   const state=states.get(name);if(!state)throw Error('Unknown worker.');
   if(state.running)return;
   state.running=true;state.lastStartedAt=new Date(now()).toISOString();
   try{await task();state.lastSucceededAt=new Date(now()).toISOString();if(state.consecutiveFailures)log({event:'worker_recovered',worker:name});state.consecutiveFailures=0;}
   catch{state.lastFailedAt=new Date(now()).toISOString();state.consecutiveFailures++;log({event:'worker_failure',worker:name,code:'invocation_failed'});}
   finally{state.lastFinishedAt=new Date(now()).toISOString();state.running=false;}
  }
 };
}
