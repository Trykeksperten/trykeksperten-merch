import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {drawTextPreview,textPreviewLayout} from '../dist/text-preview.mjs';
import {pfTextFonts} from '../dist/pf-text.mjs';
import {normalizeTextPlacement,textPrintSize,optionPrintSize,printableBounds,containMappedBounds,proportionalPrintBounds} from '../dist/design-layers.mjs';
const studio=await readFile(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8'),cartSource=await readFile(new URL('../dist/cart-mockup.mjs',import.meta.url),'utf8');
const editorFunctions=studio.slice(studio.indexOf(' function renderStudioText('),studio.indexOf(' async function preview('));
const cartFunction=cartSource.slice(cartSource.indexOf('export async function renderCartMockup('),cartSource.indexOf('export function bindCartMockups(')).replace('export async function','async function');
const noop=()=>{},identity=()=>[1,0,0,1,0,0],point=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function canvas(){
 const draws=[],stack=[];let matrix=identity();
 const ctx={font:'',textAlign:'left',fillStyle:'',save(){stack.push({matrix:[...matrix],font:this.font,align:this.textAlign,color:this.fillStyle});},restore(){const state=stack.pop();matrix=state.matrix;this.font=state.font;this.textAlign=state.align;this.fillStyle=state.color;},
  translate(x,y){matrix=multiply(matrix,[1,0,0,1,x,y]);},scale(x,y){matrix=multiply(matrix,[x,0,0,y,0,0]);},rotate(a){matrix=multiply(matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},drawImage:noop,
  measureText(text){const size=Number(this.font.match(/([\d.]+)px/)?.[1])||100;return {width:Array.from(text).reduce((sum,char)=>sum+(char===' '? .3:char==='I'?.28:.55),0)*size};},
  fillText(text,x,y){draws.push({kind:'text',text,font:this.font,align:this.textAlign,color:this.fillStyle,points:[point(matrix,x,y)]});},
  fillRect(x,y,w,h){if(this.fillStyle!=='#fff')draws.push({kind:'underline',color:this.fillStyle,points:[point(matrix,x,y),point(matrix,x+w,y+h)]});}};
 return {width:0,height:0,style:{},getContext:()=>ctx,setAttribute:noop,draws};
}
const option={id:'front',impWidthMm:100,impHeightMm:40,image:'preview.png',coorTopLeftX:300,coorTopRightX:1800,coorBottomLeftX:300,coorBottomRightX:1800,coorTopLeftY:300,coorTopRightY:300,coorBottomLeftY:900,coorBottomRightY:900};
async function renderPair(text,placement,{width=300,height=120,density=2}={}){
 const nodes={},$=id=>nodes[id]??={value:'',style:{},dataset:{},classList:{toggle:noop},setAttribute(name,value){this[name]=value;},replaceChildren(...children){this.children=children;}};
 $('text').value=text;$('ink').value='#123456';Object.assign($('designer-zone'),{clientWidth:width,clientHeight:height});
 const common={drawTextPreview,textPreviewLayout,textPrintSize,optionPrintSize,p:{id:'product'},v:{sku:'sku'},option,decorationPreviewColor:()=>null,placementOptionAssets:()=>({ready:true,image:'preview.png'})};
 const editor=vm.createContext({...common,$,textPlacement:placement,selectedFoil:'',activeArtworkId:'text',artworks:[],layerURLs:[],designerVersion:0,root:{isConnected:true},URL:{revokeObjectURL:noop},isEngraving:()=>false,loadProductImage:async()=>true,layoutZone:noop,renderTextControls:noop,renderLayerControls:noop,window:{devicePixelRatio:density},document:{fonts:{ready:Promise.resolve()},createElement:canvas}});
 vm.runInContext(editorFunctions,editor);await editor.renderDesigner();
 const target=canvas(),cart=vm.createContext({...common,loadArtworkPreview:noop,loadImage:async()=>({naturalWidth:1000,naturalHeight:1000}),printableBounds,containMappedBounds,proportionalPrintBounds,document:{fonts:{ready:Promise.resolve()},createElement:()=>target}});
 vm.runInContext(cartFunction,cart);await cart.renderCartMockup(common.p,option,{text,textPlacement:placement,ink:'#123456',artworks:[]});
 const layer=$('designer-text'),bitmap=layer.children?.[0];
 if(!text.trim())return {layer,editor:[],cart:target.draws};
 const transform=layer.style.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number),styles=Object.fromEntries(bitmap.style.cssText.split(';').filter(Boolean).map(pair=>pair.split(':')));
 const layerWidth=width*parseFloat(layer.style.width)/100,layerHeight=height*parseFloat(layer.style.height)/100;
 const cssWidth=layerWidth*parseFloat(styles.width)/100,cssHeight=layerHeight*parseFloat(styles.height)/100,offsetX=-layerWidth/2+layerWidth*parseFloat(styles.left)/100,offsetY=-layerHeight/2+layerHeight*parseFloat(styles.top)/100;
 const editorPoint=p=>{const transformed=point(transform,offsetX+p.x*cssWidth/bitmap.width,offsetY+p.y*cssHeight/bitmap.height);return {x:(transformed.x+width*parseFloat(layer.style.left)/100)*100/width,y:(transformed.y+height*parseFloat(layer.style.top)/100)*40/height};};
 const bounds=proportionalPrintBounds(containMappedBounds(printableBounds(option,1000,1000),1000,1000,1024,1024),option,1024,1024);
 const cartPoint=p=>({x:(p.x/1024-bounds.x)/bounds.width*100,y:(p.y/1024-bounds.y)/bounds.height*40});
 return {layer,editor:bitmap.draws.map(draw=>({...draw,points:draw.points.map(editorPoint)})),cart:target.draws.map(draw=>({...draw,points:draw.points.map(cartPoint)}))};
}
function compare(a,b,label){
 assert.equal(a.length,b.length,label);
 for(let i=0;i<a.length;i++){assert.deepEqual({...a[i],points:[]},{...b[i],points:[]},label);for(let j=0;j<a[i].points.length;j++)for(const axis of ['x','y'])assert.ok(Math.abs(a[i].points[j][axis]-b[i].points[j][axis])<1e-8,label+': '+axis);}
}
for(const font of pfTextFonts)test('actual editor/cart text geometry agrees for '+font+' across multiline formats, rotations and preview sizes',async()=>{
 let index=0;
 for(const align of ['left','center','right'])for(const rotation of [-180,-90,-35,0,30,90,180])for(const lineSpacing of [.8,1,1.25,2]){
  const text=index%2?'  FIRST\n\nTwo lines  ':'ÅÆØ\r\nThird line\r\n I ',placement=normalizeTextPlacement(text,{x:.4,y:.6,scale:.7,font,align,rotation,lineSpacing,letterSpacing:[-.05,0,.1][index%3],bold:Boolean(index&1),italic:Boolean(index&2),underline:Boolean(index&4)},option);
  const restored=JSON.parse(JSON.stringify(placement)),preview=[{width:90,height:36,density:3},{width:500,height:200,density:1},{width:300,height:90,density:2}][index++%3];
  const result=await renderPair(text,restored,preview);compare(result.editor,result.cart,[font,align,rotation,lineSpacing].join('/'));assert.match(result.layer['aria-label'],/Placér tekst:/);
 }
});
test('baseline spacing is independent from glyph-height estimate and underlines keep the same physical positions',()=>{
 const target=canvas(),ctx=target.getContext('2d'),layout=drawTextPreview(ctx,'ONE\nTWO',{lineSpacing:1.25,underline:true},{widthMm:60,heightMm:20},'#123456'),text=target.draws.filter(row=>row.kind==='text');
 assert.ok(Math.abs(text[1].points[0].y-text[0].points[0].y-layout.fontSize*1.25)<1e-10);assert.equal(target.draws.filter(row=>row.kind==='underline').length,2);
});
test('empty text remains hidden and produces no cart text drawing',async()=>{
 const result=await renderPair(' \n ',normalizeTextPlacement('',{},option));assert.equal(result.layer.hidden,true);assert.deepEqual(result.editor,[]);assert.deepEqual(result.cart,[]);
});
