import test from 'node:test';
import assert from 'node:assert/strict';
import {withOrderAggregateLock} from '../lib/order-aggregate-lock.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('same aggregate serializes independent callers and permits awaited nested capture',{timeout:2000},async()=>{
 const entered=deferred(),finish=deferred(),order=[];
 const first=withOrderAggregateLock('checkout-1',async()=>{order.push('first');await withOrderAggregateLock('checkout-1',async()=>order.push('nested'));entered.resolve();await finish.promise;order.push('finish');});
 await entered.promise;
 const second=withOrderAggregateLock('checkout-1',async()=>order.push('second'));
 await withOrderAggregateLock('checkout-2',async()=>order.push('independent'));
 assert.deepEqual(order,['first','nested','independent']);finish.resolve();await Promise.all([first,second]);
 assert.deepEqual(order,['first','nested','independent','finish','second']);
});

test('failed task releases its aggregate',async()=>{
 await assert.rejects(withOrderAggregateLock('failed',()=>{throw Error('failure');}),/failure/);
 assert.equal(await withOrderAggregateLock('failed',async()=> 'released'),'released');
});

test('detached continuation cannot reuse an expired ownership lease',{timeout:2000},async()=>{
 const resumeDetached=deferred(),insideNext=deferred(),finishNext=deferred(),order=[];let detached;
 await withOrderAggregateLock('detached',async()=>{detached=resumeDetached.promise.then(()=>withOrderAggregateLock('detached',async()=>order.push('detached')));});
 const next=withOrderAggregateLock('detached',async()=>{order.push('next');insideNext.resolve();await finishNext.promise;order.push('next-finish');});
 await insideNext.promise;resumeDetached.resolve();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(order,['next']);finishNext.resolve();await Promise.all([next,detached]);assert.deepEqual(order,['next','next-finish','detached']);
});
