import test from 'node:test';
import assert from 'node:assert/strict';
import {eventDescription} from '../dist/admin-event-description.mjs';

test('historical PF status includes its saved status, comment and shipping date',()=>{
 const text=eventDescription({type:'pf_status',pfStatus:'PROCESSING',pfStatusInformation:'Afventer materiale',expectedShipDate:'2026-10-29'});
 assert.match(text,/Produktionsstart er ikke særskilt bekræftet/);
 assert.match(text,/Afventer materiale/);
 assert.match(text,/29\.10\.2026/);
});
test('older status events do not invent missing historical details',()=>{
 assert.match(eventDescription({type:'pf_status'}),/ikke gemt/);
 assert.doesNotMatch(eventDescription({type:'pf_status',expectedShipDate:'invalid'}),/Invalid Date/);
});
test('technical receipt and internal payment approval do not claim business completion',()=>{
 assert.match(eventDescription({type:'gateway_accepted'}),/endnu ikke en ordrebekræftelse/);
 assert.match(eventDescription({type:'staff_proof_payment_approved'}),/Selve hævningen skal bekræftes særskilt/);
 assert.match(eventDescription({type:'customer_approved'}),/separate trin/);
});
