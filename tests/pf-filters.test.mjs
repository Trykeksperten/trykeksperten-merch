import test from 'node:test';
import assert from 'node:assert/strict';
import {insulationStatus,filterPFProducts,productColors,productMethods,sortPFProducts} from '../dist/pf-filters.mjs';

test('PF product facets use only priced variants and combine within a subcategory',()=>{
 const products=[
  {id:'cold',name:'Isoleret flaske',brand:'Brand A',brandId:'a',modelCode:'1',shopCategory:'flasker',category:'Vandflasker',insulation:'yes',variants:[{sku:'A',color:'Kongeblå',methods:['Gravering'],discontinued:false},{sku:'B',color:'Rød',methods:['Tampontryk'],discontinued:false}]},
  {id:'plain',name:'Enkeltvægget flaske',brand:'Brand B',brandId:'b',modelCode:'2',shopCategory:'flasker',category:'Vandflasker',insulation:'no',variants:[{sku:'C',color:'Rød',methods:['Tampontryk'],discontinued:false}]},
  {id:'cup',name:'Isoleret krus',brand:'Brand A',brandId:'a',modelCode:'3',shopCategory:'flasker',category:'Krus',insulation:'yes',variants:[{sku:'D',color:'Kongeblå',methods:['Gravering'],discontinued:false}]}
 ];
 const prices={available:true,products:{cold:{fromIncVat:12000},plain:{fromIncVat:4000},cup:{fromIncVat:12000}},skus:{A:true,C:true,D:true}};
 assert.deepEqual(productColors(products[0],prices),['Blå']);
 assert.deepEqual(productMethods(products[0],prices),['Gravering']);
 const params=new URLSearchParams('kategori=flasker&underkategori=Vandflasker&farve=Blå&isolering=yes&tryk=Gravering&pris=100-250');
 assert.deepEqual(filterPFProducts(products,params,prices,()=>''),[products[0]]);
 params.set('brand','b');
 assert.deepEqual(filterPFProducts(products,params,prices,()=>''),[]);
});

test('insulation is labelled only when PF product wording supports it',()=>{
 assert.equal(insulationStatus({name:'Vakuumisoleret vandflaske'}),'yes');
 assert.equal(insulationStatus({name:'Flaske',description:'Enkeltvægget drikkeflaske'}),'no');
 assert.equal(insulationStatus({name:'Drikkeflaske'}),'unknown');
});

test('catalogue sorting supports price, name and brand while keeping unknown prices last',()=>{
 const products=[
  {id:'b',name:'Beta',brand:'Zulu'},
  {id:'a',name:'Alfa',brand:'Acme'},
  {id:'u',name:'Ukendt',brand:'Acme'}
 ];
 const prices={products:{a:{fromIncVat:1000},b:{fromIncVat:5000}}};
 assert.deepEqual(sortPFProducts(products,'price-asc',prices).map(p=>p.id),['a','b','u']);
 assert.deepEqual(sortPFProducts(products,'price-desc',prices).map(p=>p.id),['b','a','u']);
 assert.deepEqual(sortPFProducts(products,'name-asc',prices).map(p=>p.id),['a','b','u']);
 assert.deepEqual(sortPFProducts(products,'name-desc',prices).map(p=>p.id),['u','b','a']);
 assert.deepEqual(sortPFProducts(products,'brand',prices).map(p=>p.id),['a','u','b']);
});
