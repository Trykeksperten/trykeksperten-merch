import test from 'node:test';
import assert from 'node:assert/strict';
import {bindExplicitDesignSave} from '../dist/designer-mobile-controls.mjs';
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
