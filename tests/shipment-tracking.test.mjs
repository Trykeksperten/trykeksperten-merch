import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingEntries} from '../dist/shipment-tracking.mjs';
test('PostNord uses Danish tracking with the complete parcel number',()=>{
 const id='00073215400755800032';
 const rows=trackingEntries([{trackingId:id,trackingURL:'https://www.postnord.se/vara-verktyg/spara-brev-paket-och-pall?shipmentid='+id}]);
 assert.equal(rows[0].trackingURL,'https://www.postnord.dk/varktojer/track-trace?shipmentId='+id);
 assert.deepEqual(trackingEntries(rows),rows);
});
test('Other carriers and unsafe URLs are not rewritten as PostNord',()=>{
 const rows=trackingEntries([{trackingId:'1',trackingURL:'https://carrier.test/1'},{trackingId:'2',trackingURL:'javascript:alert(1)'},{trackingId:'3',trackingURL:'https://postnord.se.evil.test/3'}]);
 assert.equal(rows[0].trackingURL,'https://carrier.test/1');
 assert.equal(rows[1].trackingURL,null);
 assert.equal(rows[2].trackingURL,'https://postnord.se.evil.test/3');
});
