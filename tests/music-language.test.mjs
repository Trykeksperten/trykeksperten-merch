import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('music labels settle after repeated language notifications instead of retriggering translation',()=>{
 let writes=0,languageCallback;
 const elements=new Map();
 const element=()=>({hidden:false,events:{},setAttribute(){},append(){},focus(){},replaceChildren(){},addEventListener(name,fn){this.events[name]=fn;},querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},set textContent(value){this.text=value;writes++;},get textContent(){return this.text;}});
 const nav=element(),root={lang:'da'},created=[];
 const document={documentElement:root,body:element(),querySelector(){return nav;},createElement(){const e=element();created.push(e);return e;},addEventListener(){}};
 vm.runInNewContext(readFileSync(new URL('../dist/music.mjs',import.meta.url),'utf8'),{document,URLSearchParams,MutationObserver:class{constructor(callback){languageCallback=callback;}observe(){}}});
 const initial=writes;
 for(let i=0;i<10;i++)languageCallback();
 assert.equal(writes,initial,'unchanged language must not rewrite DOM and trigger translation');
 assert.equal(created[0].textContent,'♫ Afspil musik');
 root.lang='en';languageCallback();
 assert.equal(created[0].textContent,'♫ Play music');
 const translated=writes;languageCallback();assert.equal(writes,translated);
 created[0].events.click();
 assert.equal(created[0].textContent,'♫ Stop music');
 const opened=writes;languageCallback();assert.equal(writes,opened);
 elements.get('.music-close').events.click();
 assert.equal(created[0].textContent,'♫ Play music');
 assert.equal(created[1].hidden,true);
});
