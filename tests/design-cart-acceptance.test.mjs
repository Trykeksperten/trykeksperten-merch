import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createDesignDraftStore,designCartId} from '../dist/design-draft-store.mjs';
import {normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,designGroupSize,validateArtworkLayers,overallArtworkPreflight} from '../dist/design-layers.mjs';
import {defaultTextPlacement} from '../dist/pf-text.mjs';
import {validateDecoration} from '../dist/pf-rules.mjs';
import {isFoilOption,validateFoilFinish} from '../dist/foil-options.mjs';
import {createMethodReview} from '../dist/method-change-review.mjs';
import {selectionLines} from '../dist/product-selection.mjs';
import {retainLocalPreviews,nextPendingPlacement} from '../dist/artwork-preview-loader.mjs';
import {sanitizeDesignLine} from '../lib/design-validation.mjs';
const source=await readFile(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const noop=()=>{},deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const values=new Map(),files=new Map(),requests=[];let storageFailure=null,networkFailure=null,quoteGate=null,fileId=0,cartWrites=0;
const storage={getItem:key=>values.get(key)||null,setItem(key,value){if(storageFailure?.(key))throw Error('QuotaExceededError');values.set(key,value);if(key==='pf-cart-v1')cartWrites++;}};
globalThis.indexedDB={open:()=>({})};globalThis.localStorage=storage;globalThis.window={dispatchEvent:noop};
const front={id:'front',impWidthMm:100,impHeightMm:40,impMethod:'Serigrafi',impMethodCode:'1',impLocation:'Forside',impLocationCode:'front',printCode:'P1',maxColours:'2',image:'https://images.pfconcept.com/ImprintImages_All/JPG/500x500/TEST_front.jpg'};
const back={...front,id:'back',impLocation:'Bagside',impLocationCode:'back'};
const product={id:'pf-test',modelCode:'TEST',variants:[{sku:'same-sku',options:[front,back],decorationMandatory:true}]},catalog={products:[product]};
const fetcher=async(url,request)=>{
 if(!['/api/design-check','/api/pf-quote'].includes(url))throw Error('Unexpected/external request: '+url);
 requests.push(url);if(networkFailure===url)throw Error('Network unavailable');
 const input=JSON.parse(request.body);
 if(url==='/api/design-check'){
  try{return new Response(JSON.stringify({line:sanitizeDesignLine(catalog,input.line)}),{status:200,headers:{'content-type':'application/json'}});}catch(error){return new Response(JSON.stringify({error:error.message}),{status:400,headers:{'content-type':'application/json'}});}
 }
 if(quoteGate){quoteGate.entered.resolve();await quoteGate.resume.promise;}
 return new Response(JSON.stringify({lines:input.lines.map(()=>({totalIncVat:10000})),totalIncVat:input.lines.length*10000}),{status:200,headers:{'content-type':'application/json'}});
};
globalThis.fetch=fetcher;
const {readCart,putCartLines,fetchQuote}=await import('../dist/pf-cart.mjs');
const {readJSONResponse}=await import('../dist/api-response.mjs');
const tab=()=>({state:null,replaceState(state){this.state=structuredClone(state);}});
function mount({history=tab(),cartId}={}){
 const nodes={},$=id=>nodes[id]??={value:'',textContent:'',hidden:false,disabled:false,style:{},dataset:{},closest:()=>({firstChild:{}}),querySelector:()=>({textContent:''})};
 const editId=designCartId(product.id,cartId?'?cart='+cartId:'',{history}),editLine=readCart().find(line=>line.id===editId),draftStore=createDesignDraftStore({productId:product.id,line:editLine,readCart,storage,history});
 const context=vm.createContext({$,structuredClone,crypto,fetch:fetcher,readJSONResponse,putCartLines,fetchQuote,retainLocalPreviews,selectionLines,
  p:product,v:product.variants[0],option:front,editId,editLine,editDrafts:editLine?{[editLine.sku]:editLine.decorations}: {},draftStore,allDrafts:draftStore.saved,allWorkingDrafts:draftStore.working,
  cartLineIds:editLine?[editId]:[],cartSnapshot:null,cartSaving:false,uploading:false,uploadVersion:0,currentWorkingKey:'pf-test:same-sku:front',selectedFoil:'',artworks:[],activeArtworkId:null,logo:null,textPlacement:defaultTextPlacement(),history:[],future:[],guidedIndex:0,
  selectedColors:new Map(),confirmedColourOptions:new Set(),selectedPlacementIds:new Set(['front']),currentOptions:[front,back],foilByOption:new Map(),methodReview:createMethodReview(),
  root:{isConnected:true,classList:{contains:()=>true}},defaultTextPlacement,normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,designGroupSize,validateArtworkLayers,validateDecoration,isFoilOption,validateFoilFinish,nextPendingPlacement,
  colourChoices:()=>[{colors:1},{colors:2}],visualOptions:()=>[front,back],sizeRows:()=>[{variant:product.variants[0],quantity:Number($('quantity').value)}],
  checkpoint:noop,renderApproval:noop,schedulePrice:noop,renderFoilControls:noop,updateHistoryButtons:noop,submitButton:{},renderSaved:noop,renderPlacementTabs:noop,closeDesigner:noop,overview:{open:noop},openPlacement:noop,setCartDisabled:noop,notify:noop,nav:noop,updateCartHeader:noop,printMoney:String,quoteAmount:q=>q.totalIncVat,vatLabel:()=>'',
  preflightFor:()=>({status:'approved'}),renderPreflight:()=>overallArtworkPreflight(context.artworks.map(()=>({status:'approved'})),Boolean($('text').value.trim())),
  saveFile:async(file,{preview=false}={})=>{const item={id:'asset-'+(++fileId),name:file.name,type:preview?'image/png':'application/pdf',size:1000};files.set(item.id,file);return item;},loadFile:async id=>files.get(id),deleteFile:async id=>{files.delete(id);},readArtworkPantone:async()=>[],createVectorPreview:async file=>({name:file.name+'.png'}),inspectLogoPalette:async()=>({count:1,colors:[{hex:'#000000',share:1}]}),previewHasTransparency:async()=>true,createImageBitmap:async()=>({width:600,height:200,close:noop}),
 });
 $('quantity').value=String(editLine?.quantity||25);$('colors').value='1';$('ink').value='#000000';$('method').value='1';$('position').value='front';
 vm.runInContext(extract(' const invalidateUpload=()=>{',' const snapshot='),context);
 vm.runInContext(extract(" let persistenceError=''",' const setPurchaseStep=').trim()+'\nglobalThis.persistWorking=persistWorking;',context);
 vm.runInContext(extract(' const selectedOptions=',' const preflightFor='),context);
 vm.runInContext(extract(' const hasChosenColours=',' const overview='),context);
 vm.runInContext(extract(' function currentLines(',' const onPricingChange='),context);
 vm.runInContext(extract(' function cartSelectionSnapshot(){',' function syncCartAction(){'),context);
 context.preview=async({persist=true}={})=>{if(persist)context.persistWorking();};
 vm.runInContext(extract('function chooseOption(){',' const methodDescription='),context);
 vm.runInContext(extract('async function uploadLogos(files){'," $('logo').onchange="),context);
 vm.runInContext(extract(' const savePlacement=async()=>{',' bindExplicitDesignSave(').trim()+'\nglobalThis.savePlacement=savePlacement;',context);
 vm.runInContext(extract(" $('add-cart').onclick=async()=>{",'\n if(editId'),context);
 context.chooseOption();
 return {$,context,history,draftStore,upload:file=>context.uploadLogos([file]),save:()=>context.savePlacement(),cart:()=>$('add-cart').onclick(),choose:id=>{$('position').value=id;context.chooseOption();},edit(text,{rotation=30}={}){
  $('text').value=text;$('ink').value='#000000';context.textPlacement=normalizeTextPlacement(text,{...defaultTextPlacement(),x:.6,y:.4,scale:.25,font:'Times New Roman',lineSpacing:1.5,letterSpacing:.1,rotation,underline:true},front);
  context.artworks=context.artworks.map(art=>normalizeArtworkForOption({...art,x:.3,y:.6,scale:.22,rotation:-30},front));context.confirmedColourOptions.add('front');context.persistWorking();
 }};
}

test('combined actual designer/cart acceptance: two same-SKU designs, reload, offline, quota, duplicate clicks and stale-tab recovery',async()=>{
 values.clear();files.clear();requests.length=0;cartWrites=0;
 const a=mount();await a.upload({name:'alice.pdf'});a.edit('ALICE\nTEAM');await a.save();assert.equal(a.$('editor-error').textContent,'');await a.cart();assert.equal(a.$('cart-error').textContent,'');
 const [alice]=readCart();assert.equal(alice.decorations[0].text,'ALICE\nTEAM');assert.equal(alice.decorations[0].artworks[0].logo.name,'alice.pdf');assert.ok(alice.decorations[0].artworks[0].logo.previewId);assert.equal(cartWrites,1);
 const b=mount();assert.equal(b.$('text').value,'');assert.equal(b.context.artworks.length,0);await b.upload({name:'bob.pdf'});b.edit('BOB\nTEAM',{rotation:-15});await b.save();await b.cart();
 const bob=readCart()[1];assert.notEqual(alice.id,bob.id);assert.equal(alice.sku,bob.sku);assert.equal(cartWrites,2);
 const reloadA=mount({history:a.history});assert.equal(reloadA.$('text').value,'ALICE\nTEAM');assert.deepEqual(structuredClone(reloadA.context.textPlacement),alice.decorations[0].textPlacement);assert.equal(reloadA.context.artworks[0].rotation,-30);
 reloadA.edit('ALICE PENDING');const aAgain=mount({cartId:alice.id});assert.equal(aAgain.$('text').value,'ALICE PENDING');const bAgain=mount({cartId:bob.id});assert.equal(bAgain.$('text').value,'BOB\nTEAM');assert.equal(bAgain.context.artworks[0].logo.name,'bob.pdf');
 const before=readCart();await aAgain.cart();assert.match(aAgain.$('cart-error').textContent,/Gennemfør og gem/);assert.deepEqual(readCart(),before);
 await aAgain.save();networkFailure='/api/design-check';await aAgain.cart();assert.match(aAgain.$('cart-error').textContent,/Network unavailable/);assert.deepEqual(readCart(),before);assert.equal(aAgain.context.cartSaving,false);
 const recovery=mount({cartId:alice.id});assert.equal(recovery.$('text').value,'ALICE PENDING');networkFailure='/api/pf-quote';await recovery.cart();assert.deepEqual(readCart(),before);assert.equal(recovery.context.cartSaving,false);
 networkFailure=null;quoteGate={entered:deferred(),resume:deferred()};const first=recovery.cart();await quoteGate.entered.promise;await recovery.cart();quoteGate.resume.resolve();await first;quoteGate=null;
 assert.equal(cartWrites,3);assert.equal(readCart()[0].decorations[0].text,'ALICE PENDING');assert.deepEqual(readCart()[1],bob);
 const latest=mount({cartId:alice.id}),stale=mount({cartId:alice.id});stale.context.confirmedColourOptions.add('front');storageFailure=key=>key.includes('pf-design-context');latest.edit('ALICE RECOVERED');assert.match(latest.$('editor-error').textContent,/Dit arbejde er bevaret/);latest.choose('back');latest.choose('front');assert.equal(latest.$('text').value,'ALICE RECOVERED');
 await latest.save();assert.match(latest.$('editor-error').textContent,/kunne ikke gemmes/);assert.equal(readCart()[0].decorations[0].text,'ALICE PENDING');storageFailure=null;await latest.save();
 storageFailure=key=>key==='pf-cart-v1';await latest.cart();assert.match(latest.$('cart-error').textContent,/QuotaExceeded/);assert.equal(cartWrites,3);assert.equal(latest.context.cartSaving,false);
 storageFailure=null;await latest.cart();assert.equal(cartWrites,4);assert.equal(readCart().length,2);assert.equal(readCart()[0].decorations[0].text,'ALICE RECOVERED');assert.deepEqual(readCart()[1],bob);
 await stale.cart();assert.match(stale.$('cart-error').textContent,/Kurvproduktet er ændret/);assert.equal(cartWrites,4);
 const final=mount({cartId:alice.id});assert.equal(final.$('text').value,'ALICE RECOVERED');assert.equal(final.context.artworks[0].logo.name,'alice.pdf');assert.equal(final.context.textPlacement.rotation,30);
 files.delete(final.context.artworks[0].logo.id);await final.cart();assert.match(final.$('cart-error').textContent,/logofil mangler/);assert.equal(cartWrites,4);assert.deepEqual(readCart()[1],bob);
 assert.ok(requests.every(url=>url==='/api/design-check'||url==='/api/pf-quote'));
});
