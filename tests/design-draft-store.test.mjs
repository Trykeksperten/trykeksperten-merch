import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignDraftStore,designCartId} from '../dist/design-draft-store.mjs';
const history=()=>({state:{unrelated:'preserved'},replaceState(value){this.state=structuredClone(value);}});
const line=(id,text)=>({id,productId:'p',sku:'same-sku',quantity:1,decorations:[{optionId:'front',text,textPlacement:{x:.3,y:.4,scale:.2,rotation:30},artworks:[{id:'art-'+id,logo:{id:'file-'+id},x:.6,y:.5,scale:.3,rotation:-45}]}]});
function fixture(){
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const cart=[line('A','Alice'),line('B','Bob')];let uuid=0;
 const create=(item=null,tab=history())=>createDesignDraftStore({productId:'p',line:item,readCart:()=>cart,storage,history:tab,randomUUID:()=> 'new-'+(++uuid)});
 return {values,storage,cart,create};
}
test('same SKU cart lines and tabs keep working and saved designs isolated through reload',()=>{
 const f=fixture(),a=f.create(f.cart[0]),b=f.create(f.cart[1]),key='p:same-sku:front';
 a.saveWorking({[key]:{...f.cart[0].decorations[0],text:'Alice unsaved'}});
 b.saveWorking({[key]:{...f.cart[1].decorations[0],text:'Bob unsaved'}});
 a.save({'same-sku':[{...f.cart[0].decorations[0],text:'Alice saved'}]});
 b.save({'same-sku':[{...f.cart[1].decorations[0],text:'Bob saved'}]});
 assert.equal(f.create(f.cart[0]).working()[key].text,'Alice unsaved');assert.equal(f.create(f.cart[1]).working()[key].text,'Bob unsaved');
 assert.equal(f.create(f.cart[0]).saved()['same-sku'][0].text,'Alice saved');assert.equal(f.create(f.cart[1]).saved()['same-sku'][0].text,'Bob saved');
 a.saveWorking({});assert.equal(f.create(f.cart[1]).working()[key].text,'Bob unsaved');
 assert.deepEqual(b.saved()['same-sku'][0].artworks,f.cart[1].decorations[0].artworks);
 assert.deepEqual(b.saved()['same-sku'][0].textPlacement,f.cart[1].decorations[0].textPlacement);
});
test('new design history context survives reload while independent new tabs remain separate',()=>{
 const f=fixture(),tabA=history(),tabB=history(),a=f.create(null,tabA),b=f.create(null,tabB);
 a.saveWorking({front:{text:'New A'}});b.saveWorking({front:{text:'New B'}});
 assert.equal(f.create(null,tabA).working().front.text,'New A');assert.equal(f.create(null,tabB).working().front.text,'New B');
 assert.equal(tabA.state.unrelated,'preserved');assert.deepEqual(f.create(f.cart[0]).working(),{});
});
test('unowned legacy drafts stay recoverable but cannot override either cart line or a new design',()=>{
 const f=fixture();f.storage.setItem('pf-working-designs-v1',JSON.stringify({'p:same-sku:front':{text:'Ambiguous old draft'}}));f.storage.setItem('pf-designs-v1',JSON.stringify({'same-sku':[{text:'Ambiguous old saved'}]}));
 const before=new Map(f.values);
 for(const item of [null,...f.cart]){const store=f.create(item);assert.deepEqual(store.saved(),{});assert.deepEqual(store.working(),{});}
 for(const [key,value]of before)assert.equal(f.storage.getItem(key),value);
});
test('cart updates invalidate obsolete draft basis and stop stale tabs from saving over the current design',()=>{
 const f=fixture(),old=f.create(f.cart[0]);old.saveWorking({front:{text:'Old pending'}});
 f.cart[0]=line('A','Updated elsewhere');const fresh=f.create(f.cart[0]);assert.deepEqual(fresh.working(),{});
 fresh.saveWorking({front:{text:'New pending'}});
 assert.throws(()=>old.saveWorking({front:{text:'Stale overwrite'}}),/Kurvproduktet er ændret/);assert.throws(()=>old.assertCurrent(),/Kurvproduktet er ændret/);
 assert.equal(f.create(f.cart[0]).working().front.text,'New pending');
 f.cart.splice(0,1);assert.throws(()=>fresh.save({}),/Kurvproduktet er ændret/);
});
test('quantity-only cart updates preserve design drafts',()=>{
 const f=fixture(),store=f.create(f.cart[0]);store.saveWorking({front:{text:'Pending'}});f.cart[0].quantity=10;
 store.assertCurrent();assert.equal(f.create(f.cart[0]).working().front.text,'Pending');
});
test('new design attaches to its actual cart id and subsequent updates rebase scoped storage',()=>{
 const f=fixture(),tab=history(),store=f.create(null,tab);store.save({'same-sku':f.cart[0].decorations});store.saveWorking({front:{text:'Pending'}});
 store.attachCart('A');assert.equal(designCartId('p','',{history:tab}),'A');assert.equal(designCartId('p','?cart=B',{history:tab}),'B');assert.equal(designCartId('other','',{history:tab}),'');
 assert.equal(f.create(f.cart[0]).working().front.text,'Pending');assert.deepEqual(f.create(f.cart[1]).working(),{});
 f.cart[0]=line('A','Updated by this tab');store.attachCart('A');store.assertCurrent();assert.equal(f.create(f.cart[0]).working().front.text,'Pending');
});
test('malformed or incorrectly owned envelopes are ignored without deleting unrelated storage',()=>{
 const f=fixture(),store=f.create(f.cart[0]);store.saveWorking({front:{text:'Correct'}});
 const key=[...f.values.keys()][0],value=JSON.parse(f.values.get(key));
 for(const patch of [{context:'cart:B'},{productId:'other'},{basis:'wrong'},{version:1}]){f.storage.setItem(key,JSON.stringify({...value,...patch}));assert.deepEqual(store.working(),{});}
 f.storage.setItem(key,'{broken');assert.deepEqual(store.working(),{});
});
