import test from 'node:test';import assert from 'node:assert/strict';import {applyPilotColour} from '../lib/pilot-colour.mjs';
const fixture=()=>({adminPilot:true,totalIncVat:124613,events:[],lines:[{productId:'pf-38687',sku:'38687070',quantity:10,decorations:[{optionId:'printdata_cse1_dk_label_v3:8182',width:85,height:25,colors:1,artworks:[{logo:{id:'a'}}]}]}],artworks:[{id:'a',pantone:{sha256:'bf9c98608c8b1d06f101dba29ccd947581a38f7cda431460141c89e6cc727b88'}}]});
test('717 C is restricted to approved pilot original, dimensions, quantity and amount',()=>{
 assert.deepEqual(applyPilotColour(fixture()).pfColourOverrides,{'0:0':['717 C']});
 for(const mutate of [o=>o.totalIncVat++,o=>o.lines[0].quantity++,o=>o.artworks[0].pantone.sha256='other',o=>o.lines[0].decorations[0].artworks[0].color='#ffffff']){const o=fixture();mutate(o);assert.throws(()=>applyPilotColour(o));}
 const normal=fixture();normal.adminPilot=false;assert.equal(applyPilotColour(normal).pfColourOverrides,undefined);
});
