import test from 'node:test';
import assert from 'node:assert/strict';
import {bindExplicitDesignSave,previewScrollTarget,bindDesignerKeyboard} from '../dist/designer-mobile-controls.mjs';
function keyboardFixture(mobile=true){
 const events=()=>{const listeners=new Map();return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type){for(const fn of listeners.get(type)||[])fn();},listeners};};
 const classes=new Set(),viewport={...events(),height:780},media={...events(),matches:mobile},doc={activeElement:null},queued=[];
 const pane={scrollTop:0,getBoundingClientRect:()=>({top:140,bottom:380})};
 const input={tagName:'TEXTAREA',type:'textarea',getBoundingClientRect:()=>({top:350,bottom:420})};
 const designer={...events(),isConnected:true,contains:node=>node===input,querySelector:()=>pane,classList:{remove:name=>classes.delete(name),toggle(name,value){if(value)classes.add(name);else classes.delete(name);}}};
 const win={...events(),innerHeight:780,visualViewport:viewport,matchMedia:()=>media,requestAnimationFrame:fn=>queued.push(fn),queueMicrotask:fn=>queued.push(fn)};
 const dispose=bindDesignerKeyboard(designer,{doc,win});
 return {designer,doc,input,viewport,win,pane,classes,dispose,flush(){while(queued.length)queued.shift()();}};
}
test('phone text entry hides save before keyboard animation and reveals the field',()=>{
 const f=keyboardFixture();f.doc.activeElement=f.input;f.designer.emit('focusin');assert.equal(f.classes.has('pf-keyboard-editing'),true);f.flush();assert.ok(f.pane.scrollTop>0);
 f.viewport.height=420;f.viewport.emit('resize');assert.equal(f.classes.has('pf-keyboard-editing'),true);
 f.viewport.height=780;f.viewport.emit('resize');assert.equal(f.classes.has('pf-keyboard-editing'),false,'native keyboard dismissal restores save even if textarea keeps focus');
 f.viewport.emit('scroll');assert.equal(f.classes.has('pf-keyboard-editing'),false);
 f.viewport.height=420;f.viewport.emit('resize');assert.equal(f.classes.has('pf-keyboard-editing'),true,'reopening the keyboard on the same focused field hides save again');
});
test('blur restores phone controls without saving; desktop never enters phone keyboard layout',()=>{
 const f=keyboardFixture();f.doc.activeElement=f.input;f.designer.emit('focusin');f.doc.activeElement=null;f.designer.emit('focusout');f.flush();assert.equal(f.classes.has('pf-keyboard-editing'),false);f.dispose();assert.equal(f.viewport.listeners.get('resize').size,0);
 const desktop=keyboardFixture(false);desktop.doc.activeElement=desktop.input;desktop.designer.emit('focusin');assert.equal(desktop.classes.has('pf-keyboard-editing'),false);
});
test('zoom keeps the print area centred and clamps scrolling at preview edges',()=>{
 const frame={left:0,top:0,width:390,height:260};
 assert.deepEqual(previewScrollTarget(frame,{left:300,top:400,width:100,height:20},{left:0,top:0,width:780,height:780}),{left:155,top:280});
 assert.deepEqual(previewScrollTarget(frame,{left:-100,top:-80,width:20,height:10},{left:0,top:0,width:780,height:780}),{left:0,top:0});
 assert.deepEqual(previewScrollTarget(frame,{left:900,top:900,width:100,height:20},{left:0,top:0,width:780,height:780}),{left:390,top:520});
});
function setup(){let saves=0;const events=()=>({listeners:{},addEventListener(k,f){this.listeners[k]=f;},removeEventListener(k){delete this.listeners[k];}}),form=events(),button=events();const dispose=bindExplicitDesignSave(form,button,()=>saves++);const event=(data={})=>({button:0,clientX:100,clientY:100,timeStamp:100,detail:1,preventDefault(){this.prevented=true;},...data});return {form,button,dispose,event,saves:()=>saves};}
test('text-field and implicit form submits cannot save or advance the design',()=>{
 const f=setup();assert.equal(f.button.type,'button');const submit=f.event();f.form.listeners.submit(submit);assert.equal(submit.prevented,true);assert.equal(f.saves(),0);
 const retargetedClick=f.event();f.button.listeners.click(retargetedClick);assert.equal(f.saves(),0);assert.equal(retargetedClick.prevented,true);
});
test('a direct press saves once; scrolling, cancellation and keyboard-layout movement do not save',()=>{
 const f=setup();f.button.listeners.pointerdown(f.event());f.button.listeners.click(f.event({timeStamp:200}));assert.equal(f.saves(),1);f.button.listeners.click(f.event({timeStamp:210}));assert.equal(f.saves(),1);
 f.button.listeners.pointerdown(f.event());f.button.listeners.pointercancel();f.button.listeners.click(f.event({timeStamp:200}));assert.equal(f.saves(),1);
 f.button.listeners.pointerdown(f.event());f.button.listeners.click(f.event({clientY:180,timeStamp:200}));assert.equal(f.saves(),1);
 f.button.listeners.pointerdown(f.event());f.button.listeners.click(f.event({timeStamp:4000}));assert.equal(f.saves(),1);
});
test('explicit keyboard and assistive button activation remain supported',()=>{const f=setup();f.button.listeners.click(f.event({detail:0}));assert.equal(f.saves(),1);f.dispose();assert.deepEqual(f.button.listeners,{});assert.deepEqual(f.form.listeners,{});});
