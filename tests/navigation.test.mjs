import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldHandleNavigation} from '../dist/navigation.mjs';
const origin='https://smerch.dk',click={button:0};
const link=(path,attrs={})=>Object.assign(new URL(path,origin),{target:attrs.target||'',download:attrs.download||'',hasAttribute:name=>Object.hasOwn(attrs,name)});
test('PDF download links bypass the router even when the download attribute is empty',()=>{
 assert.equal(shouldHandleNavigation(link('/api/pf-documents?productId=pf-107385&document=fsc',{download:''}),click,origin),false);
 assert.equal(shouldHandleNavigation(link('/guide.pdf',{download:''}),click,origin),false);
 assert.equal(shouldHandleNavigation(link('/api/pf-documents?document=size-guide'),click,origin),false);
 assert.equal(shouldHandleNavigation(link('/produkter'),click,origin),true);
});
test('router preserves browser link behavior for other tabs, anchors and modified clicks',()=>{
 for(const l of [link('/produkter',{target:'_blank'}),link('/#kontakt'),link('https://example.com/')])assert.equal(shouldHandleNavigation(l,click,origin),false);
 for(const event of [{button:1},{button:0,ctrlKey:true},{button:0,metaKey:true},{button:0,altKey:true},{button:0,defaultPrevented:true}])assert.equal(shouldHandleNavigation(link('/produkter'),event,origin),false);
});
