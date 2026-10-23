import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderPlacementChoices('),source.indexOf('function openPlacement('));
function selection(options,{selected=[],saved=[],chosen=true}={}){
 const nodes=new Map();
 const context=vm.createContext({currentOptions:[],decorationChosen:chosen,selectedPlacementIds:new Set(selected),designs:()=>saved.map(optionId=>({optionId})),v:{},placementThumbnailImage:()=>'',e:String,$:id=>{if(!nodes.has(id))nodes.set(id,{querySelectorAll:()=>[]});return nodes.get(id);},renderColorChoices(){},renderApproval(){},designForm:{},root:{classList:{remove(){}}},document:{documentElement:{classList:{remove(){}}}}});
 vm.runInContext(render,context);context.renderPlacementChoices(options.map(id=>({id,impLocation:id})));
 return [...context.selectedPlacementIds];
}
test('multiple placements remain unselected even with saved design drafts',()=>assert.deepEqual(selection(['body','clip'],{saved:['body']}),[]));
test('the only placement is selected after choosing a print method',()=>assert.deepEqual(selection(['body']),['body']));
test('no placement is selected before choosing a print method',()=>assert.deepEqual(selection(['body'],{chosen:false}),[]));
test('explicit basket selections survive rendering and unavailable placements are removed',()=>assert.deepEqual(selection(['body','clip'],{selected:['clip','old'],saved:['body']}),['clip']));
