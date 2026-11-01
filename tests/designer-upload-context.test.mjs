import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeArtworkForOption,normalizeTextPlacement} from '../dist/design-layers.mjs';
import {defaultTextPlacement} from '../dist/pf-text.mjs';
import {createDesignDraftStore} from '../dist/design-draft-store.mjs';
import {selectionLines,transferColourQuantities} from '../dist/product-selection.mjs';
const source=await readFile(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const noop=()=>{};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function harness({pause,fail}={}){
 const nodes={},listeners={},classes=new Set(['designer-active']),files=new Map(),deleted=[],persisted=[],errors=[],closed=[],entered=deferred(),resume=deferred();let uid=0;
 const $=id=>nodes[id]??={value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle:noop},focus:noop,closest:()=>({firstChild:{}}),querySelector:()=>({focus:noop}),querySelectorAll:()=>[],addEventListener:(name,listener)=>{listeners[id+':'+name]=listener;}};
 const front={id:'front',impWidthMm:100,impHeightMm:40,image:'front.png'},back={id:'back',impWidthMm:40,impHeightMm:100,image:'back.png'};
 const variants=[{sku:'sku-a',options:[front,back],images:[]},{sku:'sku-b',options:[front,back],images:[]}];
 const boundary=async(name,file,result)=>{if(fail?.(name,file))throw Error('Invalid upload');if(pause?.(name,file)){entered.resolve();await resume.promise;}return result;};
 const context=vm.createContext({$,structuredClone,crypto:{randomUUID:()=> 'art-'+(++uid)},p:{id:'p',variants},v:variants[0],option:front,currentWorkingKey:'p:sku-a:front',
  root:{isConnected:true,classList:{contains:name=>classes.has(name),remove:name=>classes.delete(name)}},document:{documentElement:{classList:{remove:noop}},addEventListener:(name,listener)=>{listeners['document:'+name]=listener;}},methodConfirm:{open:false},
  uploadVersion:0,uploading:false,designerVersion:0,artworks:[],activeArtworkId:null,logo:null,selectedFoil:'',foilByOption:new Map(),selectedColors:new Map(),confirmedColourOptions:new Set(),selectedPlacementIds:new Set(),textPlacement:defaultTextPlacement(),history:[],future:[],
  checkpoint:noop,normalizeArtworkForOption,normalizeTextPlacement,defaultTextPlacement,renderApproval:noop,schedulePrice:noop,renderColorChoices:noop,renderFoilControls:noop,updateHistoryButtons:noop,submitButton:{},setPurchaseStep:noop,
  visualOptions:()=>context.v.options,designs:()=>[],allWorkingDrafts:()=>({}),designForm:{hidden:false},placementStep:{scrollIntoView:noop},
  editLine:null,quantityEdited:true,priceData:{},minimumQuantityApplied:false,printPriceData:null,productTierData:null,renderProductTiers:noop,showProductPhoto:noop,renderMethodCards:noop,renderSaved:noop,e:String,
  saveFile:async(file,{preview=false}={})=>{const item={id:'file-'+(++uid),name:file.name,type:preview?'image/png':'application/pdf'};files.set(item.id,item);return boundary(preview?'save-preview':'save-original',file,item);},
  deleteFile:async id=>{deleted.push(id);files.delete(id);},readArtworkPantone:file=>boundary('pantone',file,[]),createVectorPreview:file=>boundary('vector',file,{name:file.name+'-preview',source:file.name}),
  inspectLogoPalette:file=>boundary('palette',file,{count:1,colors:[{hex:'#000000',share:1}]}),previewHasTransparency:file=>boundary('transparency',file,true),
  createImageBitmap:file=>boundary('bitmap',file,{width:600,height:200,close:()=>closed.push(file.name)}),
  preview:async({persist=true}={})=>{if(persist)persisted.push({sku:context.v.sku,option:context.option.id,artworks:structuredClone(context.artworks)});},notify:message=>errors.push(message)});
 context.chooseMethod=()=>{$('position').value=context.v.options[0].id;context.chooseOption();};
 $('position').value='front';$('variant').value='sku-a';
 vm.runInContext(extract(' const invalidateUpload=()=>{',' const snapshot=').trim()+'\nglobalThis.invalidateUpload=invalidateUpload;',context);
 vm.runInContext(extract('function chooseOption(){',' const methodDescription='),context);
 vm.runInContext(extract('function chooseVariant(){','\n\n const methodConfirm='),context);
 vm.runInContext(extract(' const closeDesigner=()=>{',' function renderPlacementChoices(').trim()+'\nglobalThis.closeDesigner=closeDesigner;',context);
 vm.runInContext(extract(' const closeUpload=()=>{'," $('text').onfocus="),context);
 vm.runInContext(extract('async function uploadLogos(files){'," $('logo').onchange="),context);
 return {context,$,nodes,files,deleted,persisted,errors,closed,entered:entered.promise,resume:resume.resolve,
  change(kind){if(kind==='placement'){$('position').value='back';context.chooseOption();}else if(kind==='variant'){$('variant').value='sku-b';context.chooseVariant();}else if(kind==='close')context.closeDesigner();else if(kind==='removed')context.root.isConnected=false;else if(kind==='generation')context.invalidateUpload();else if(kind==='upload-close')$('close-upload').onclick();else if(kind==='upload-backdrop')listeners['upload-modal:click']({target:$('upload-modal')});else if(kind==='upload-escape'){$('check-modal').hidden=true;listeners['document:keydown']({key:'Escape'});}},
  upload:files=>context.uploadLogos(files)};
}

for(const stage of ['save-original','pantone','vector','palette','transparency','bitmap','save-preview']){
 test('upload cancellation after '+stage+' cannot mutate another placement, variant, closed or removed editor',async()=>{
  for(const transition of ['placement','variant','close','removed','generation','upload-close','upload-backdrop','upload-escape']){
   const f=harness({pause:name=>name===stage}),task=f.upload([{name:'front.pdf'}]);await f.entered;f.change(transition);f.resume();await task;
   assert.equal(f.context.artworks.length,0,transition);assert.equal(f.persisted.length,0,transition);assert.equal(f.errors.length,0,transition);assert.equal(f.files.size,0,transition);
   if(stage==='bitmap'||stage==='save-preview')assert.equal(f.closed.length,1);
  }
 });
}
test('a dismissed upload cannot insert artwork or hide a reopened upload dialog',async()=>{
 for(const transition of ['upload-close','upload-backdrop','upload-escape']){
  const f=harness({pause:name=>name==='vector'}),task=f.upload([{name:'dismissed.pdf'}]);await f.entered;
  f.change(transition);assert.equal(f.context.uploading,false);assert.equal(f.$('upload-modal').hidden,true);
  f.$('open-upload').onclick();f.resume();await task;
  assert.equal(f.$('upload-modal').hidden,false);assert.equal(f.context.artworks.length,0);assert.equal(f.persisted.length,0);assert.equal(f.files.size,0);
 }
});
test('overlapping upload completion cannot clear or append to the newer batch',async()=>{
 const f=harness({pause:(name,file)=>name==='vector'&&file.name==='old.pdf'}),old=f.upload([{name:'old.pdf'}]);await f.entered;
 await f.upload([{name:'new.pdf'}]);const committed=structuredClone(f.context.artworks);f.resume();await old;
 assert.deepEqual(structuredClone(f.context.artworks),committed);assert.equal(f.context.artworks[0].logo.name,'new.pdf');assert.equal(f.persisted.length,1);assert.equal(f.context.uploading,false);
 assert.equal(f.files.size,2);assert.equal(f.errors.length,0);
});
test('a failed later file rolls back the entire pending batch and preserves existing artwork',async()=>{
 const f=harness({fail:(name,file)=>name==='vector'&&file.name==='bad.pdf'}),existing={id:'existing',logo:{id:'existing-file'},x:.5,y:.5,scale:.2};f.context.artworks=[existing];
 await f.upload([{name:'first.pdf'},{name:'bad.pdf'}]);assert.equal(f.context.artworks.length,1);assert.equal(f.context.artworks[0],existing);assert.equal(f.persisted.length,0);assert.equal(f.files.size,0);assert.deepEqual(f.errors,['Invalid upload']);assert.equal(f.context.uploading,false);
});
test('successful multi-file upload commits once with matching placement metadata and retained files',async()=>{
 const f=harness();await f.upload([{name:'one.pdf'},{name:'two.pdf'}]);
 assert.equal(f.persisted.length,1);assert.equal(f.persisted[0].option,'front');assert.equal(f.persisted[0].sku,'sku-a');assert.deepEqual(Array.from(f.context.artworks,art=>art.logo.name),['one.pdf','two.pdf']);
 assert.equal(f.files.size,4);assert.equal(f.closed.length,2);assert.equal(f.context.uploading,false);assert.equal(f.nodes['upload-modal'].hidden,true);
});
test('late failure from a cancelled upload does not display an error in the next editor',async()=>{
 const f=harness({pause:name=>name==='vector'});f.context.createVectorPreview=async()=>{await f.context.readArtworkPantone({name:'other'});await new Promise(resolve=>{f.rejectOld=()=>{resolve();};});throw Error('Old preview failed');};
 const task=f.upload([{name:'old.pdf'}]);while(!f.rejectOld)await Promise.resolve();f.change('placement');f.rejectOld();await task;
 assert.equal(f.errors.length,0);assert.equal(f.files.size,0);assert.equal(f.context.artworks.length,0);
});

function storageFixture(){
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},cart=[];let uuid=0;
 const store=line=>createDesignDraftStore({productId:'p',line,readCart:()=>cart,storage,history:{state:null,replaceState(value){this.state=value;}},randomUUID:()=> 'draft-'+(++uuid)});
 const bind=(f,drafts,line)=>{
  Object.assign(f.context,{draftStore:drafts,allDrafts:drafts.saved,allWorkingDrafts:drafts.working,editDrafts:line?{[line.sku]:line.decorations}:{},isFoilOption:()=>false});
  vm.runInContext(extract(" let persistenceError=''",' const setPurchaseStep=').trim()+'\nglobalThis.persistWorking=persistWorking;',f.context);
 };
 return {values,cart,store,bind};
}
test('real chooseOption and persistWorking restore only the selected cart line after reload',()=>{
 const s=storageFixture(),design=text=>({optionId:'front',text,colors:1,artworks:[],textPlacement:{x:.5,y:.5,scale:.2,rotation:30}});
 s.cart.push({id:'A',productId:'p',sku:'sku-a',decorations:[design('Alice')]},{id:'B',productId:'p',sku:'sku-a',decorations:[design('Bob')]});
 const a=harness();s.bind(a,s.store(s.cart[0]),s.cart[0]);a.context.chooseOption();a.$('text').value='Alice pending';a.context.persistWorking();
 const b=harness();s.bind(b,s.store(s.cart[1]),s.cart[1]);b.context.chooseOption();assert.equal(b.$('text').value,'Bob');b.$('text').value='Bob pending';b.context.persistWorking();
 for(const [index,expected]of [[0,'Alice pending'],[1,'Bob pending']]){const reopened=harness();s.bind(reopened,s.store(s.cart[index]),s.cart[index]);reopened.context.chooseOption();assert.equal(reopened.$('text').value,expected);assert.equal(reopened.context.textPlacement.rotation,30);}
});
test('colour migration replaces an older scoped saved design when returning to a previous SKU',()=>{
 const s=storageFixture(),f=harness(),drafts=s.store(null);s.bind(f,drafts,null);f.context.closeDesigner();
 const design=text=>({optionId:'front',text,colors:1,artworks:[],textPlacement:{x:.5,y:.5,scale:.2}});
 drafts.save({'sku-a':[design('Latest A')],'sku-b':[design('Old B')]});
 Object.assign(f.context,{selectedColor:'a',groups:[{key:'a',variants:[f.context.p.variants[0]]},{key:'b',variants:[f.context.p.variants[1]]}],guidedIndex:0,sizeQuantities:{'sku-a':3},
  orderVariants:()=>[f.context.v],selectionLines,transferColourQuantities,placementOptionAssets:()=>({ready:true}),validateDecoration:()=>'',renderSizes:noop,renderStock:noop,renderEditorColours:noop,productFlow:null});
 f.$('quantity').value='3';f.$('method').value='print';
 vm.runInContext(extract(' function changeProductColour(key){',' let productFlow;'),f.context);
 f.context.changeProductColour('b');assert.equal(f.context.v.sku,'sku-b');assert.equal(f.$('text').value,'Latest A');assert.equal(drafts.saved()['sku-b'][0].text,'Latest A');
 const saved=drafts.saved();saved['sku-b'][0].text='Newest B';drafts.save(saved);
 f.context.changeProductColour('a');assert.equal(f.context.v.sku,'sku-a');assert.equal(f.$('text').value,'Newest B');assert.equal(drafts.saved()['sku-a'][0].text,'Newest B');
});
test('failed colour migration keeps the active colour and both scoped saved designs intact',()=>{
 const s=storageFixture(),f=harness(),drafts=s.store(null);s.bind(f,drafts,null);f.context.closeDesigner();
 const design=text=>({optionId:'front',text,colors:1,artworks:[],textPlacement:{x:.5,y:.5,scale:.2}});
 drafts.save({'sku-a':[design('Current A')],'sku-b':[design('Previous B')]});const before=drafts.saved();
 Object.assign(f.context,{selectedColor:'a',groups:[{key:'a',variants:[f.context.p.variants[0]]},{key:'b',variants:[f.context.p.variants[1]]}],guidedIndex:0,sizeQuantities:{'sku-a':3},
  orderVariants:()=>[f.context.v],selectionLines,transferColourQuantities,placementOptionAssets:()=>({ready:true}),validateDecoration:()=>'',renderSizes:noop,renderStock:noop,renderEditorColours:noop,productFlow:null});
 f.$('quantity').value='3';f.$('method').value='print';s.values.set=()=>{throw Error('QuotaExceededError');};
 vm.runInContext(extract(' function changeProductColour(key){',' let productFlow;'),f.context);
 f.context.changeProductColour('b');assert.equal(f.context.selectedColor,'a');assert.equal(f.context.v.sku,'sku-a');assert.deepEqual(drafts.saved(),before);assert.match(f.$('editor-error').textContent,/Dit arbejde er bevaret/);
});
test('secondary size line opens its canonical cart design without the primary line pending draft',()=>{
 const s=storageFixture(),drafts=s.store(null),f=harness(),design={optionId:'front',text:'Shared printed design',artworks:[],colors:1};
 const lines=selectionLines(f.context.p,f.context.v,{productId:'p',decorations:[design]},f.context.p.variants.map((variant,index)=>({variant,quantity:index+1})));
 s.cart.push(...lines.map((line,index)=>({...line,id:'line-'+index})));
 drafts.save({'sku-a':[design]});drafts.attachCart('line-0');drafts.saveWorking({'p:sku-a:front':{...design,text:'Primary pending'}});
 const secondary=harness();secondary.context.v=secondary.context.p.variants[1];s.bind(secondary,s.store(s.cart[1]),s.cart[1]);secondary.context.chooseOption();
 assert.equal(secondary.$('text').value,'Shared printed design');assert.deepEqual(s.store(s.cart[1]).working(),{});assert.equal(s.cart[1].quantity,2);
});
test('actual cart save rechecks its scoped cart basis after async validation and quote',async()=>{
 for(const change of ['design','removed','quantity']){
  const s=storageFixture(),f=harness(),entered=deferred(),resume=deferred();let writes=0;
  const original={id:'A',productId:'p',sku:'sku-a',quantity:1,decorations:[{optionId:'front',text:'Initial',colors:1,artworks:[]}]};
  s.cart.push(original);const drafts=s.store(original),submitted={...original,decorations:[{...original.decorations[0],text:'Edited here'}]};
  Object.assign(f.context,{draftStore:drafts,cartLineIds:['A'],cartSnapshot:null,cartSaving:false,cartSelectionSnapshot:()=> 'submitted',setCartDisabled:noop,
   selectedOptions:()=>[f.context.option],currentLine:()=>submitted,currentLines:line=>[line],needsSaving:()=>false,
   fetch:async(_url,options)=>JSON.parse(options.body),readJSONResponse:async response=>response,retainLocalPreviews:line=>line,
   fetchQuote:async()=>{entered.resolve();await resume.promise;return {lines:[{totalIncVat:100}]};},
   putCartLines:lines=>{writes++;s.cart.splice(0,s.cart.length,...lines);return lines;},printMoney:String,quoteAmount:()=>100,vatLabel:()=> 'inkl. moms',updateCartHeader:noop});
  f.$('method').value='print';vm.runInContext(extract(" $('add-cart').onclick=async()=>{",'\n if(editId'),f.context);
  const task=f.$('add-cart').onclick();await entered.promise;
  if(change==='design')s.cart[0]={...original,decorations:[{...original.decorations[0],text:'Edited in other tab'}]};
  else if(change==='removed')s.cart.length=0;
  else s.cart[0]={...original,quantity:20};
  resume.resolve();await task;
  assert.equal(f.context.cartSaving,false);
  if(change==='quantity'){
   assert.equal(writes,1);assert.equal(f.$('cart-error').textContent,'');assert.equal(s.cart[0].decorations[0].text,'Edited here');drafts.assertCurrent();
  }else{
   assert.equal(writes,0);assert.match(f.$('cart-error').textContent,/Kurvproduktet er ændret/);
   assert.equal(s.cart[0]?.decorations[0].text,change==='design'?'Edited in other tab':undefined);
  }
 }
});
test('postcommit preview persists the original placement and its renderer ignores a later placement switch',async()=>{
 const s=storageFixture(),f=harness(),drafts=s.store(null),entered=deferred(),resume=deferred();s.bind(f,drafts,null);
 Object.assign(f.context,{layerURLs:[],URL:{revokeObjectURL:noop},decorationPreviewColor:()=>null,isEngraving:()=>false,isBlindEmbossing:()=>false,
  syncDetectedColors:noop,uploadButton:f.$('open-upload'),renderPantonePanel:noop,renderPreflight:noop,renderColorWarning:noop,
  placementOptionAssets:(_p,option)=>({ready:option.id==='front',image:'front.png'}),
  loadProductImage:async()=>{entered.resolve();await resume.promise;return true;},layoutZone:()=>{assert.fail('Cancelled renderer must not lay out the previous product');}});
 vm.runInContext(extract(' async function renderDesigner(){',' function chooseOption(){'),f.context);
 const task=f.upload([{name:'committed.pdf'}]);await entered.promise;
 assert.equal(drafts.working()['p:sku-a:front'].artworks[0].logo.name,'committed.pdf');
 f.change('placement');resume.resolve();await task;
 assert.equal(f.context.option.id,'back');assert.equal(f.context.artworks.length,0);assert.equal(drafts.working()['p:sku-a:back'],undefined);
 assert.equal(f.$('designer-product').dataset.optionId,undefined);assert.equal(f.files.size,2);assert.equal(f.errors.length,0);
});
