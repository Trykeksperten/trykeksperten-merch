import test from 'node:test';
import assert from 'node:assert/strict';

test('engraved text uses silver in saved mockups, including underlining; printing and foil keep their colours',async()=>{
 const previous={document:globalThis.document,Image:globalThis.Image,indexedDB:globalThis.indexedDB,window:globalThis.window,createImageBitmap:globalThis.createImageBitmap};
 globalThis.indexedDB={open:()=>({})};
 const draws=[];
 const ctx={save(){},restore(){},translate(){},scale(){},rotate(){},drawImage(){},measureText(text){return {width:text.length*50};},fillText(text){draws.push({kind:'text',color:this.fillStyle,text});},fillRect(){draws.push({kind:'rect',color:this.fillStyle});}};
 globalThis.Image=class{naturalWidth=500;naturalHeight=500;set src(value){queueMicrotask(()=>this.onload());}};
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({getContext:()=>ctx,setAttribute(){},toBlob(callback){callback(new Blob(['preview'],{type:'image/png'}));}})};
 globalThis.window={document:globalThis.document};globalThis.createImageBitmap=async()=>({width:20,height:20,close(){}});
 try{
  const {renderCartMockup}=await import('../dist/cart-mockup.mjs');
  const base={image:'https://images.pfconcept.com/ImprintImages_All/JPG/500x500/TEST_front.jpg',impWidthMm:80,impHeightMm:40,impLocation:'Forside',coorTopLeftX:300,coorTopRightX:1200,coorBottomLeftX:300,coorBottomRightX:1200,coorTopLeftY:400,coorTopRightY:400,coorBottomLeftY:1000,coorBottomRightY:1000};
  const design={text:'SMERCH',ink:'#ee0000',textPlacement:{underline:true}};
  for(const [method,extra,expected] of [['Gravering',{},'#9e9e9e'],['360 Gravering',{},'#9e9e9e'],['Laser engraving',{},'#9e9e9e'],['Transfer',{},'#ee0000'],['Prægning',{},'#000000'],['Folieprægning',{impMethodCode:9},'#b69549']]){
   draws.length=0;
   await renderCartMockup({modelCode:'TEST'},{...base,impMethod:method,...extra},{...design,foilFinish:extra.impMethodCode?'gold':undefined});
   assert.equal(draws.find(row=>row.kind==='text').color,expected,method);
   assert.equal(draws.filter(row=>row.kind==='rect').at(-1).color,expected,method+' underline');
   assert.equal(design.ink,'#ee0000','source ink remains unchanged');
  }
  draws.length=0;await renderCartMockup({modelCode:'TEST'},{...base,impMethod:'Prægning'},design,{variant:{hex:'#123456'}});assert.equal(draws.find(row=>row.kind==='text').color,'#0d243c');assert.equal(draws.filter(row=>row.kind==='rect').at(-1).color,'#0d243c');
  draws.length=0;const art={logo:{name:'logo.png'},x:.5,y:.5,scale:.5};await renderCartMockup({modelCode:'TEST'},{...base,impMethod:'Prægning'},{...design,artworks:[art]},{variant:{hex:'#123456'},loadPreview:async()=>new Blob(['original'],{type:'image/png'})});assert.equal(draws.filter(row=>row.kind==='rect')[1].color,'#0d243c','logo tint matches text');assert.equal(draws.find(row=>row.kind==='text').color,'#0d243c');
 }finally{Object.assign(globalThis,previous);}
});
