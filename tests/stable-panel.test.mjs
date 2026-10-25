import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStablePanel} from '../dist/stable-panel.mjs';
function panel(){const attrs=new Map();return {innerHTML:'old prices',height:241,style:{removeProperty(){delete this.minHeight;}},getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value),get offsetHeight(){return this.height;}};}
test('loading reserves the previous price panel height and removes stale interactive prices',()=>{
 const node=panel();renderStablePanel(node,'Beregner pris…',{pending:true});
 assert.equal(node.style.minHeight,'241px');assert.equal(node.innerHTML,'Beregner pris…');assert.equal(node.getAttribute('aria-busy'),'true');
 node.height=40;renderStablePanel(node,'Indlæser…',{pending:true});assert.equal(node.style.minHeight,'241px','repeated loading must not shrink the reservation');
 renderStablePanel(node,'new variant prices');assert.equal(node.style.minHeight,undefined);assert.equal(node.getAttribute('aria-busy'),'false');assert.equal(node.innerHTML,'new variant prices');
});
test('an error replaces loading and releases the reservation',()=>{
 const node=panel();renderStablePanel(node,'Indlæser…',{pending:true});renderStablePanel(node,'Prisen kunne ikke hentes.');
 assert.equal(node.innerHTML,'Prisen kunne ikke hentes.');assert.equal(node.style.minHeight,undefined);
});
