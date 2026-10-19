import test from 'node:test';
import assert from 'node:assert/strict';
import {colorGroups,selectedSizeRows,selectionLines} from '../dist/product-selection.mjs';
const option={id:'front',impMethodCode:'screen',impLocation:'Front',printCode:'A',impWidthMm:100,impHeightMm:100};
const variants=['M','L','XL'].map((size,i)=>({sku:`s${i}`,color:'Navy',colorCode:'55',size,options:[{...option,id:`front${i}`}]}));
test('clothing sizes display in wearing order rather than supplier SKU order',()=>{
 const sizes=['XS','XL','2XL','3XL','L','M','S'];
 const input=sizes.map(size=>({sku:size,colorCode:'black',size}));
 assert.deepEqual(colorGroups(input)[0].variants.map(variant=>variant.size),['XS','S','M','L','XL','2XL','3XL']);
 assert.deepEqual(input.map(variant=>variant.size),sizes);
 const numeric=['42','8','40','10'].map(size=>({sku:size,size}));
 assert.deepEqual(colorGroups(numeric)[0].variants.map(variant=>variant.size),['8','10','40','42']);
});
test('one colour contains all sizes and selected quantities remain separate',()=>{
 assert.equal(colorGroups([...variants,{sku:'white',color:'Hvid',colorCode:'01'}]).length,2);
 const rows=selectedSizeRows(variants,{s0:10,s1:10,s2:10});
 const lines=selectionLines({id:'shirt'},variants[0],{productId:'shirt',decorations:[{optionId:'front0',text:'Smerch',width:50,height:20}]},rows);
 assert.deepEqual(lines.map(line=>[line.sku,line.quantity,line.decorations[0].optionId]),[['s0',10,'front0'],['s1',10,'front1'],['s2',10,'front2']]);
 assert.equal(lines.reduce((sum,line)=>sum+line.quantity,0),30);
});
test('empty, fractional and negative quantities cannot proceed',()=>{
 for(const counts of [{},{s0:-1},{s0:1.5},{s0:100001}])assert.throws(()=>selectedSizeRows(variants,counts));
 assert.equal(selectedSizeRows(variants,{s0:0,s1:10}).length,1);
});
test('incompatible print areas cannot silently reuse artwork',()=>{
 const target={...variants[1],options:[{...option,id:'other',impWidthMm:30}]};
 assert.throws(()=>selectionLines({},variants[0],{decorations:[{optionId:'front0'}]},[{variant:target,quantity:10}]),/passer ikke/);
});
