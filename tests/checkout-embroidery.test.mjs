import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {designGroupSize} from '../dist/design-layers.mjs';
import {checkoutPublic,persistCheckout,prepareCheckout,updateCheckout} from '../lib/checkout.mjs';
import {checkoutEmbroideryReview,handoffAuthorizedCheckout,pfAssetsForGroup,setPFColours} from '../lib/order-flow.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {listOrders,readOrder} from '../lib/pf-orders.mjs';

const env={
 STRIPE_SECRET_KEY:'sk_test_demo',STRIPE_WEBHOOK_SECRET:'whsec_demo',SMERCH_PUBLIC_BASE_URL:'https://example.test',
 SMERCH_FREIGHT_EX_VAT_DKK:'40',PF_AUTO_SUBMIT_ENABLED:'1',PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'test',
 PF_GATEWAY_PASSWORD:'test',PF_GATEWAY_SENDER_ID:'TEST',PF_COMMUNICATION_EMAIL:'proof@example.test',
 SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32)
};
const mockup='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function fixture(){
 const p=await loadPFProduct('pf-120632'),v=p.variants[0],option=v.options.find(o=>o.impMethod==='Broderi fixed');
 const stamp=new Date().toISOString(),catalog={products:[p]},stock={updatedAt:stamp,items:{[v.sku]:{available:100}}},rules={goodsMarkup:0,printMarkup:0};
 const prices={productDate:stamp,printDate:stamp,products:{[v.sku]:{currency:'DKK',minimumDecoration:25,tiers:[{min:1,net:100}]}},prints:{[option.printCode]:{currency:'DKK',dependence:'None',ltm:0,combinations:[{area:0,colors:1,setups:1,setup:100,tiers:[{min:1,net:10}]}]}}};
 const textPlacement={x:.5,y:.5,scale:.24},size=designGroupSize([],'TEST',textPlacement,option);
 const line={productId:p.id,sku:v.sku,quantity:25,decorations:[{optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'TEST',textPlacement}]};
 const dependencies={catalog,prices,rules,stock,env};
 const order=prepareCheckout({lines:[line,line],shipping:{name:'Demo',email:'demo@example.test',phone:'12345678',street:'Testvej 1',postalCode:'1000',city:'København',country:'DK'}},dependencies);
 order.legal={customerType:'consumer'};
 order.mockups=[{filename:'mockup-1-1.png',base64:mockup},{filename:'mockup-2-1.png',base64:mockup}];
 return {order,dependencies};
}

test('checkout defers only missing embroidery codes and still checks every required mockup and original file',async()=>{
 const {order}=await fixture(),group=order.fulfillment.groups[0];
 assert.deepEqual(checkoutEmbroideryReview(order,{env}),[{lineIndex:0,decorationIndex:0},{lineIndex:1,decorationIndex:0}]);
 assert.throws(()=>pfAssetsForGroup(order,group,{env}),/bekræftes manuelt/);
 assert.throws(()=>checkoutEmbroideryReview({...order,mockups:order.mockups.slice(0,1)},{env}),/Mockup mangler/);
 const decoration=order.lines[1].decorations[0];
 decoration.artworks=[{logo:{id:'logo'},color:'#123456'}];
 assert.throws(()=>checkoutEmbroideryReview(order,{env}),/Farven er ændret/);
 decoration.artworks=[];
 decoration.method='Digital transfer fixed';
 assert.throws(()=>checkoutEmbroideryReview(order,{env}),/bekræftes manuelt/);
});

test('a reserved embroidery checkout holds every PF group until confirmed, then sends each group once',async()=>{
 const root=await mkdtemp(join(tmpdir(),'checkout-embroidery-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{
  const {order,dependencies}=await fixture(),group=order.fulfillment.groups[0];
  order.fulfillment.groups=[{...group,lineIndexes:[0]},{...group,lineIndexes:[1]}];
  dependencies.env={...env,SMERCH_FREIGHT_PL_EX_VAT_DKK:'20'};
  order.pfColourReview=checkoutEmbroideryReview(order,{env});
  await persistCheckout(order);
  let calls=0;
  const dispatch=async id=>{
   calls++;
   const pf=await readOrder(id);
   assert.deepEqual(pf.lines[0].decorations[0].pmsColors,[pf.checkoutGroupIndex===0?'Madeira 1000':'Madeira 1001']);
   pf.status='gateway_accepted';
   await writeFile(join(root,'orders',id+'.json'),JSON.stringify(pf));
   return pf;
  };
  assert.equal((await handoffAuthorizedCheckout(order.id,{...dependencies,dispatch})).status,'prepared');
  await assert.rejects(setPFColours(order.id,0,0,['Madeira 1000']),/aktiv reservation/);
  await updateCheckout(order.id,current=>({...current,status:'authorized',authorizationExpiresAt:new Date(Date.now()+86400000).toISOString()}));
  await assert.rejects(setPFColours(order.id,0,0,['#101010','extra']),/én gyldig kode/);
  await setPFColours(order.id,0,0,['Madeira 1000']);
  const held=await handoffAuthorizedCheckout(order.id,{...dependencies,dispatch});
  assert.equal(held.status,'authorized');
  assert.equal(held.pfHandoff.status,'blocked');
  assert.equal(checkoutPublic(held).awaitingEmbroideryReview,true);
  assert.deepEqual(await listOrders(),[]);
  assert.equal(calls,0);
  await setPFColours(order.id,1,0,['Madeira 1001']);
  const results=await Promise.all([1,2].map(()=>handoffAuthorizedCheckout(order.id,{...dependencies,dispatch})));
  assert.ok(results.every(result=>result.pfHandoff.status==='submitted'));
  assert.equal(checkoutPublic(results[0]).awaitingEmbroideryReview,false);
  assert.equal(calls,2);
  await assert.rejects(setPFColours(order.id,1,0,['Madeira 1002']),/efter PF-ordren er oprettet/);
 }finally{
  if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
});
