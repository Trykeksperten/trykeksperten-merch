import test from 'node:test';
import assert from 'node:assert/strict';
import {bindExplicitDesignSave,previewScrollTarget} from '../dist/designer-mobile-controls.mjs';
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
