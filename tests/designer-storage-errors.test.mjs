import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createDesignDraftStore} from '../dist/design-draft-store.mjs';
import {normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,designGroupSize} from '../dist/design-layers.mjs';
import {defaultTextPlacement} from '../dist/pf-text.mjs';
import {designColorCount} from '../dist/design-colors.mjs';
const source=await readFile(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const noop=()=>{};
function fixture(){
 const values=new Map(),nodes={},events=[];let failure=null,writes=0;
 const storage={getItem:key=>values.get(key)||null,setItem(key,value){writes++;if(failure)throw failure;values.set(key,value);}};
 const line={id:'A',productId:'p',sku:'sku',decorations:[]},cart=[line],history={state:{},replaceState(value){this.state=value;}};
 const store=createDesignDraftStore({productId:'p',line,readCart:()=>cart,storage,history,randomUUID:()=> 'new'});
 const $=id=>nodes[id]??={value:'',textContent:'',hidden:false,style:{},closest:()=>({firstChild:{}})};
 const front={id:'front',impWidthMm:100,impHeightMm:40},back={id:'back',impWidthMm:60,impHeightMm:100};
 const context=vm.createContext({$,structuredClone,draftStore:store,allDrafts:store.saved,allWorkingDrafts:store.working,editDrafts:{},p:{id:'p',modelCode:'p'},v:{sku:'sku'},option:front,
  currentWorkingKey:'p:sku:front',selectedFoil:'',artworks:[],activeArtworkId:'text',textPlacement:defaultTextPlacement(),uploading:false,selectedColors:new Map(),foilByOption:new Map(),logo:null,history:[],future:[],guidedIndex:0,
  defaultTextPlacement,normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,designGroupSize,renderApproval:()=>events.push('approval'),schedulePrice:()=>events.push('price'),isFoilOption:()=>false,
  isEngraving:()=>false,isBlindEmbossing:()=>false,renderStudioText:()=>events.push('render'),renderPantonePanel:noop,syncDetectedColors:noop,renderDesigner:()=>events.push('render'),renderPreflight:()=>({status:'approved'}),renderColorWarning:noop,decorationPreviewColor:()=>null,
  bindConfirmedColourPicker:noop,designer:{},checkpoint:noop,hasChosenColours:()=>true,validateFoilFinish:()=>'',validateArtworkLayers:()=>'',validateDecoration:()=>'',preflightFor:()=>({status:'approved'}),
  methodReview:{saved:()=>events.push('review-saved')},renderSaved:noop,renderPlacementTabs:noop,nextPendingPlacement:()=>-1,selectedOptions:()=>[front],needsSaving:()=>false,closeDesigner:()=>events.push('closed'),overview:{open:()=>events.push('overview')},openPlacement:noop,
  invalidateUpload:noop,visualOptions:()=>[front,back],renderFoilControls:noop,updateHistoryButtons:noop,submitButton:{},preview:async()=>{},notify:message=>events.push(message)});
 $('quantity').value='1';$('colors').value='1';$('ink').value='#000000';$('position').value='front';
 vm.runInContext(extract(" let persistenceError=''",' const setPurchaseStep=').trim()+'\nglobalThis.persistWorking=persistWorking;',context);
 vm.runInContext(extract('function chooseOption(){',' const methodDescription='),context);
 vm.runInContext(extract(" $('text').onfocus=",' const updateTextLayout='),context);
 vm.runInContext(extract(' const savePlacement=async()=>{',' bindExplicitDesignSave(').trim()+'\nglobalThis.savePlacement=savePlacement;',context);
 return {context,$,events,store,values,storage,line,cart,fail:error=>{failure=error;},writes:()=>writes};
}
test('typing and removing customer text immediately refreshes the complete design colour warning',()=>{
 const f=fixture();
 Object.assign(f.context,{designColorCount,colourChoices:()=>[{colors:1},{colors:2}],artworks:[{logo:{detectedPalette:[{hex:'#000000'}]}}]});
 vm.runInContext(extract(' const renderColorWarning=','function renderColorChoices()'),f.context);
 f.$('colors').value='2';f.$('ink').value='#17201f';
 f.$('text').value='Privat ÆØÅ';f.$('text').oninput();
 assert.equal(f.$('color-warning').hidden,true);
 assert.equal(f.$('color-warning').innerHTML,'');
 f.$('text').value='';f.$('text').oninput();
 assert.equal(f.$('color-warning').className,'pf-color-warning');assert.equal(f.$('color-warning').hidden,false);
 assert.match(f.$('color-warning').innerHTML,/cirka 1 farve/);
 f.$('text').value='Privat ÆØÅ';f.$('text').oninput();
 assert.equal(f.$('color-warning').hidden,true);assert.equal(f.$('color-warning').innerHTML,'');
});
for(const name of ['QuotaExceededError','SecurityError'])test('autosave '+name+' keeps text/layers through placement navigation and shows live editor error',()=>{
 const f=fixture(),art={id:'art',logo:{id:'file',pixelWidth:300,pixelHeight:100},x:.4,y:.6,scale:.3,rotation:30};
 f.fail(Object.assign(Error(name),{name}));f.context.artworks=[art];f.$('text').value='Latest customer text';f.$('text').oninput();
 assert.match(f.$('editor-error').textContent,/Dit arbejde er bevaret her/);assert.match(f.$('editor-error').textContent,/Undlad at genindlæse/);assert.equal(f.$('error').textContent,f.$('editor-error').textContent);
 assert.ok(f.events.includes('render'));assert.ok(f.events.includes('approval'));assert.equal(f.store.working()['p:sku:front'].text,'Latest customer text');
 f.$('position').value='back';f.context.chooseOption();f.$('text').value='Back draft';f.$('text').oninput();
 f.$('position').value='front';f.context.chooseOption();assert.equal(f.$('text').value,'Latest customer text');assert.equal(f.context.artworks[0].rotation,30);
 f.fail(null);f.$('text').oninput();assert.equal(f.$('editor-error').textContent,'');
 const restored=createDesignDraftStore({productId:'p',line:f.line,readCart:()=>f.cart,storage:f.storage,history:{state:{},replaceState:noop},randomUUID:()=> 'reload'});
 assert.equal(restored.working()['p:sku:front'].text,'Latest customer text');assert.equal(restored.working()['p:sku:back'].text,'Back draft');
});
test('explicit placement save is atomic, keeps pending work on quota failure and retries successfully',async()=>{
 const f=fixture();f.$('text').value='Save me';f.$('text').oninput();const before=new Map(f.values),count=f.writes();f.fail(Error('QuotaExceededError'));
 await f.context.savePlacement();assert.equal(f.writes(),count+1);assert.deepEqual(f.values,before);assert.deepEqual(f.store.saved(),{});assert.equal(f.store.working()['p:sku:front'].text,'Save me');
 assert.match(f.$('editor-error').textContent,/kunne ikke gemmes/);assert.ok(!f.events.includes('closed'));assert.ok(!f.events.includes('review-saved'));assert.equal(f.$('text').value,'Save me');
 f.fail(null);await f.context.savePlacement();assert.equal(f.writes(),count+2);assert.equal(f.store.saved().sku[0].text,'Save me');assert.deepEqual(f.store.working(),{});assert.equal(f.$('editor-error').textContent,'');
 assert.ok(f.events.includes('closed'));assert.ok(f.events.includes('review-saved'));assert.equal(f.values.size,1);
});
test('an external cart revision reports the conflict without accepting stale save or clearing work',async()=>{
 const f=fixture();f.$('text').value='Unsaved original';f.$('text').oninput();f.cart[0]={...f.line,decorations:[{text:'Changed in other tab'}]};
 await f.context.savePlacement();assert.match(f.$('editor-error').textContent,/Kurvproduktet er ændret/);assert.equal(f.$('text').value,'Unsaved original');assert.ok(!f.events.includes('closed'));
});
test('editor alert is outside the footer hidden by mobile keyboard mode',()=>{
 const html=extract('designer.innerHTML=`',";artPreview.before(designer)"),alert=html.indexOf('id="pf-editor-error"'),footer=html.indexOf('class="pf-designer-foot"');
 assert.ok(alert>0&&alert<footer);assert.match(html.slice(alert,alert+130),/role="alert"/);
});
test('matching v2 drafts migrate together, keeping originals untouched if the atomic write fails',()=>{
 const f=fixture(),base=JSON.stringify({productId:'p',sku:'sku',decorations:[]}),prefix='pf-design-context-v2:p:cart%3AA:';
 for(const [kind,drafts]of [['saved',{sku:[{text:'Owned saved'}]}],['working',{'p:sku:front':{text:'Owned working'}}]])f.values.set(prefix+kind,JSON.stringify({version:2,context:'cart:A',productId:'p',basis:base,drafts}));
 assert.equal(f.store.saved().sku[0].text,'Owned saved');assert.equal(f.store.working()['p:sku:front'].text,'Owned working');const before=new Map(f.values);
 f.fail(Error('QuotaExceededError'));assert.throws(()=>f.store.commit({sku:[{text:'New saved'}]},{}),/Quota/);assert.deepEqual(f.values,before);
 f.fail(null);f.store.commit({sku:[{text:'New saved'}]},{});assert.equal(f.store.saved().sku[0].text,'New saved');assert.deepEqual(f.store.working(),{});
 for(const [key,value]of before)assert.equal(f.values.get(key),value);
 const stateKey=[...f.values.keys()].find(key=>key.includes('-v3:'));f.values.set(stateKey,'{broken');
 assert.deepEqual(f.store.saved(),{});assert.deepEqual(f.store.working(),{},'corrupt v3 must not resurrect superseded v2 drafts');
});
test('temporarily unreadable storage keeps the last saved state and pending autosave in memory',()=>{
 const f=fixture();f.store.save({sku:[{text:'Previously saved'}]});f.$('text').value='Current pending';f.$('text').oninput();
 f.storage.getItem=()=>{throw Error('SecurityError');};f.fail(Error('SecurityError'));f.$('text').value='Latest pending';f.$('text').oninput();
 assert.equal(f.store.saved().sku[0].text,'Previously saved');assert.equal(f.store.working()['p:sku:front'].text,'Latest pending');assert.match(f.$('editor-error').textContent,/Tillad browserens lokale lager/);
});
test('cart attachment storage failure reports a warning after one successful cart write and preserves attached state',async()=>{
 const f=fixture();f.$('text').value='Canonical cart design';await f.context.savePlacement();const decorations=f.store.saved().sku;let writes=0;
 const submitted={productId:'p',sku:'sku',quantity:1,decorations};f.$('added').querySelector=()=>({textContent:''});f.$('method').value='print';
 Object.assign(f.context,{cartSaving:false,cartLineIds:['A'],cartSnapshot:null,editLine:null,cartSelectionSnapshot:()=> 'submitted',setCartDisabled:noop,currentLine:()=>submitted,currentLines:line=>[line],
  fetch:async(_url,request)=>JSON.parse(request.body),readJSONResponse:async response=>response,retainLocalPreviews:line=>line,fetchQuote:async()=>({lines:[{totalIncVat:100}]}),
  putCartLines:lines=>{writes++;f.cart.splice(0,f.cart.length,...lines.map(line=>({...line,id:'A'})));return f.cart;},printMoney:String,quoteAmount:()=>100,vatLabel:()=>'',updateCartHeader:noop});
 vm.runInContext(extract(" $('add-cart').onclick=async()=>{",'\n if(editId'),f.context);f.fail(Error('QuotaExceededError'));await f.$('add-cart').onclick();
 assert.equal(writes,1);assert.equal(f.$('cart-error').textContent,'');assert.equal(f.context.cartSnapshot,'submitted');assert.equal(f.context.cartSaving,false);
 assert.equal(f.cart[0].decorations[0].text,'Canonical cart design');assert.equal(f.store.saved().sku[0].text,'Canonical cart design');assert.match(f.$('editor-error').textContent,/Dit arbejde er bevaret/);
 f.fail(null);f.store.saveWorking(f.store.working());assert.equal(f.store.saved().sku[0].text,'Canonical cart design');f.store.assertCurrent();
});


test('colour mismatch explains the save block, preserves both files and text, and matching colours allow review',async()=>{
 const f=fixture();
 Object.assign(f.context,{designColorCount,colourChoices:()=>[{colors:1},{colors:3},{colors:4}],artworks:[{id:'front',logo:{id:'pdf1',detectedPalette:[{hex:'#ff0000'}]}},{id:'back',logo:{id:'pdf2',detectedPalette:[{hex:'#0000ff'}]}}]});
 vm.runInContext(extract(' const renderColorWarning=','function renderColorChoices()'),f.context);
 f.$('text').value='Privat ÆØÅ\niPhone 123';f.$('ink').value='#000000';f.$('text').oninput();
 assert.match(f.$('color-warning').innerHTML,/cirka 3 farver, men der er valgt 1/);
 assert.match(f.$('color-warning').innerHTML,/data-return-colour-choice/);
 const reason='Logoet har cirka 3 farver, men der er valgt 1. Vælg mindst 3 trykfarver, eller ret originalfilens farver og upload den igen.';
 f.context.renderPreflight=()=>({status:'rejected',label:'Farveantal passer ikke',checks:[reason]});
 const writes=f.writes();await f.context.savePlacement();
 assert.equal(f.writes(),writes);assert.equal(f.$('editor-error').textContent,reason);
 assert.equal(f.context.artworks.length,2);assert.equal(f.$('text').value,'Privat ÆØÅ\niPhone 123');
 assert.ok(!f.events.includes('closed'));
 f.$('colors').value='4';f.$('text').oninput();assert.equal(f.$('color-warning').hidden,false);assert.match(f.$('color-warning').innerHTML,/cirka 3 farver/);assert.match(f.$('color-warning').innerHTML,/Du har valgt 4 farver/);assert.match(f.$('color-warning').innerHTML,/færre farver end valgt/);assert.doesNotMatch(f.$('color-warning').innerHTML,/Vælg flere trykfarver/);
 f.$('colors').value='3';f.$('text').oninput();assert.equal(f.$('color-warning').hidden,true);assert.equal(f.$('color-warning').innerHTML,'');
 f.context.renderPreflight=()=>({status:'review',label:'Kræver filkontrol'});await f.context.savePlacement();
 assert.equal(f.$('editor-error').textContent,'');assert.equal(f.store.saved().sku[0].artworks.length,2);
 assert.equal(f.store.saved().sku[0].text,'Privat ÆØÅ\niPhone 123');assert.ok(f.events.includes('closed'));
});
