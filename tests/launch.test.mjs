import test from 'node:test';
import assert from 'node:assert/strict';
import {launchConfig,countdown,blocksLaunchOrder} from '../dist/launch-config.mjs';
test('countdown shares a fixed deadline and stops at zero',()=>{
 const end=Date.parse(launchConfig.launchAt);
 assert.deepEqual(countdown(end-7*86400000),[7,0,0,0]);
 assert.deepEqual(countdown(end-90061000),[1,1,1,1]);
 assert.deepEqual(countdown(end),[0,0,0,0]);
 assert.deepEqual(countdown(end+86400000),[0,0,0,0]);
 assert.equal(launchConfig.ordersEnabled,false);
});
test('prelaunch blocks order and payment renewal but permits browsing, pricing and enquiries',()=>{
 assert.equal(blocksLaunchOrder('/api/checkout/session','POST'),true);
 assert.equal(blocksLaunchOrder('/api/checkout/pay-example/reauthorize','POST'),true);
 for(const path of ['/api/checkout/status','/produkter','/design/example'])assert.equal(blocksLaunchOrder(path,'GET'),false);
 for(const path of ['/api/checkout/fulfillment','/api/contact','/api/special-inquiry','/api/quickpay/callback'])assert.equal(blocksLaunchOrder(path,'POST'),false);
});
