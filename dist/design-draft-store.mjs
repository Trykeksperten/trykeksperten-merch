const stateKey='smerchDesignContext';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const basis=line=>line?JSON.stringify({productId:line.productId,sku:line.sku,decorations:line.decorations||[]}):null;
export function designCartId(productId,search,{history=globalThis.history}={}){
 const requested=new URLSearchParams(search).get('cart');
 if(requested)return requested;
 const state=history?.state?.[stateKey];return state?.productId===productId?state.cartId||'':'';
}
export function createDesignDraftStore({productId,line=null,readCart,storage,history=globalThis.history,randomUUID=()=>crypto.randomUUID()}={}){
 const previous=history?.state?.[stateKey];
 const id=previous?.productId===productId&&typeof previous.id==='string'?previous.id:randomUUID();
 let cartId=line?.id||null,base=basis(line),context=cartId?'cart:'+cartId:'new:'+id,pendingWorking=null,pendingSaved=null,lastState={saved:{},working:{}};
 const remember=()=>history?.replaceState({...record(history.state),[stateKey]:{productId,id,cartId}},'');
 remember();
 const key=(version,kind)=>`pf-design-context-v${version}:`+encodeURIComponent(productId)+':'+encodeURIComponent(context)+':'+kind;
 const owned=value=>value?.context===context&&value.productId===productId&&value.basis===base;
 const parse=value=>{try{return JSON.parse(value||'null');}catch{return null;}};
 const readState=()=>{
  try{
   const target=storage??globalThis.localStorage,raw=target.getItem(key(3,'state')),value=parse(raw);
   if(raw!==null){lastState=owned(value)&&value.version===3?{saved:record(value.saved),working:record(value.working)}:{saved:{},working:{}};}
   else{
    // Only migrate v2 drafts whose owner AND canonical cart basis match.
    const legacy=kind=>{const value=parse(target.getItem(key(2,kind)));return owned(value)&&value.version===2?record(value.drafts):{};};
    lastState={saved:legacy('saved'),working:legacy('working')};
   }
  }catch{/* A temporarily unavailable storage API must not erase in-memory work. */}
  return structuredClone({...lastState,saved:pendingSaved??lastState.saved,working:pendingWorking??lastState.working});
 };
 const assertCurrent=()=>{
  if(!cartId)return;
  const current=readCart().find(item=>item.id===cartId);
  if(!current||basis(current)!==base)throw Error('Kurvproduktet er ændret. Åbn det igen fra kurven, før du gemmer.');
 };
 const commit=(saved,working)=>{
  assertCurrent();const state=structuredClone({saved,working});
  // Saved design and pending-draft removal are one atomic localStorage write.
  (storage??globalThis.localStorage).setItem(key(3,'state'),JSON.stringify({version:3,context,productId,basis:base,...state}));
  lastState=state;pendingWorking=null;pendingSaved=null;
 };
 // v1 records have no cart/design owner. Keep them intact for recovery, but
 // never guess their owner or automatically override an existing cart design.
 return {
  assertCurrent,commit,
  saved:()=>readState().saved,working:()=>readState().working,
  save:drafts=>commit(drafts,readState().working),
  saveWorking(drafts){
   assertCurrent();const saved=readState().saved;
   try{commit(saved,drafts);}catch(error){pendingWorking=structuredClone(drafts);throw error;}
  },
  attachCart(nextId){
   const next=readCart().find(item=>item.id===nextId&&item.productId===productId);
   if(!next)throw Error('Kurvproduktet er fjernet. Åbn det igen fra kataloget.');
   const state=readState();cartId=next.id;base=basis(next);context='cart:'+cartId;
   lastState=state;pendingWorking=state.working;remember();
   try{commit(state.saved,state.working);}catch(error){pendingSaved=state.saved;return error;}
  }
 };
}
