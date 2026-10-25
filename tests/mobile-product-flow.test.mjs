import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMobileProductFlow,nextRotation} from '../dist/mobile-product-flow.mjs';
import {normalizeTextPlacement} from '../dist/design-layers.mjs';
test('mobile choices stay on one page; only continuing after a ready design scrolls to the basket',()=>{
 const element=()=>({children:[],dataset:{},style:{},attributes:{},listeners:{},classList:{add(){}},append(...nodes){this.children.push(...nodes);},before(){},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},removeEventListener(k){delete this.listeners[k];}});
 let colour='black',changes=0,scrolls=0,ready=false;const created=[],title={textContent:'1. Vælg farve og antal'},media={...element(),matches:true};
 const first={querySelector:()=>title},label=element(),select={...element(),value:'black',closest:()=>label,dispatchEvent(){changes++;colour=this.value;}},placement=element(),check=element();
 const nodes={'#pf-variant':{closest:()=>first},'#pf-product-color':select,'#pf-placement-step':placement,'#pf-check-continue':check,'#pf-add-cart':{closest:()=>({scrollIntoView(){scrolls++;}})}};
 const root={...element(),isConnected:true,querySelector:key=>nodes[key]},doc={createElement(){const node=element();created.push(node);return node;}},win={matchMedia:query=>query.includes('max-width')?media:{matches:true}};
 bindMobileProductFlow(root,{groups:[{key:'black',name:'Sort',hex:'#000'},{key:'blue',name:'Blå',hex:'#00f'}],selectedColour:()=>colour,designReady:()=>ready,doc,win});
 const swatches=created.find(node=>node.className==='pf-mobile-product-colours');
 swatches.listeners.click({target:{closest:()=>swatches.children[1]}});assert.equal(colour,'blue');assert.equal(changes,1);assert.equal(scrolls,0);assert.equal(root.dataset.mobileStep,undefined);assert.equal(root.dataset.mobileLayout,'stacked');
 swatches.listeners.click({target:{closest:()=>swatches.children[1]}});assert.equal(changes,1,'clicking selected colour preserves entered quantities');
 root.listeners.input();assert.equal(scrolls,0,'editing several size quantities never advances the page');
 check.listeners.click();assert.equal(scrolls,0);ready=true;check.listeners.click();assert.equal(scrolls,1);
 media.matches=false;media.listeners.change();assert.equal(root.dataset.mobileLayout,undefined);assert.equal(title.textContent,'1. Vælg farve og antal');
});
test('eight 45 degree rotations return to the starting orientation and remain in supported range',()=>{
 let angle=0;const angles=[];for(let i=0;i<8;i++){angle=nextRotation(angle);angles.push(angle);assert.ok(angle>=-180&&angle<=180);}
 assert.deepEqual(angles,[45,90,135,-180,-135,-90,-45,0]);
});
test('changing a text layer with shared size and rotation controls preserves valid print-area placement',()=>{
 const option={impWidthMm:70,impHeightMm:7};
 let placement=normalizeTextPlacement('MOTIONSDAG',{scale:.24,x:.5,y:.5},option);
 placement=normalizeTextPlacement('MOTIONSDAG',{...placement,scale:.4,rotation:nextRotation(placement.rotation)},option);
 assert.equal(placement.scale,.4);assert.equal(placement.rotation,45);assert.ok(placement.x>=0&&placement.x<=1);assert.ok(placement.y>=0&&placement.y<=1);
});
