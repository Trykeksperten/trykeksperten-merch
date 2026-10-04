import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recordStatistics,statisticsReport,normalizeStatisticsEvent} from '../lib/shop-statistics.mjs';
import {cartStatistics} from '../dist/shop-statistics.mjs';
test('cart changes count units, exclude unchanged designs, and distinguish emptying',()=>{
 const a={productId:'p',sku:'M',quantity:10};
 assert.deepEqual(cartStatistics([], [a,{...a,sku:'L'}]),[{type:'cart_add',units:20}]);
 assert.deepEqual(cartStatistics([a],[{...a,quantity:5}]),[{type:'cart_remove',units:5}]);
 assert.deepEqual(cartStatistics([a],[{...a,decorations:[{}]}]),[]);
 assert.deepEqual(cartStatistics([a],[]),[{type:'cart_remove',units:10},{type:'cart_empty'}]);
});
test('event whitelist discards extra data and rejects malformed events',()=>{
 assert.deepEqual(normalizeStatisticsEvent({type:'page_view',page:'home',email:'private',path:'/secret'}),{type:'page_view',page:'home'});
 for(const event of [{type:'anything'},{type:'page_view',page:'/secret'},{type:'cart_add',units:-2},{type:'cart_add',units:1.2}])assert.throws(()=>normalizeStatisticsEvent(event));
});
test('persistent hourly aggregates use Danish calendar days and handle concurrent writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-stats-')),path=join(dir,'stats.json'),now=Date.parse('2026-10-04T22:30:00Z');
 try{
  const empty=await statisticsReport({path,now});assert.equal(empty.startedAt,null);
  await Promise.all(Array.from({length:5},()=>recordStatistics([{type:'page_view',page:'product'},{type:'cart_add',units:30}],{path,now})));
  await recordStatistics([{type:'cart_remove',units:10},{type:'cart_empty'}],{path,now});
  const report=await statisticsReport({path,days:1,now});assert.equal(report.from,'2026-10-05');assert.equal(report.hourly[0].views,5);assert.equal(report.totals.events.page_view,5);assert.equal(report.totals.units.cart_add,150);assert.equal(report.totals.events.cart_empty,1);
  const stored=JSON.parse(await readFile(path));assert.equal(Object.keys(stored.hours).length,1);assert.equal(stored.hours['2026-10-04T22'].events.cart_add,5);
  await recordStatistics([{type:'page_view',page:'home'}],{path,now:now+91*86400000});const later=JSON.parse(await readFile(path));assert.equal(Object.keys(later.hours).length,1);
  await assert.rejects(statisticsReport({path,days:999,now}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
