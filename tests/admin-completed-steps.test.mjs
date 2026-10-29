import test from 'node:test';
import assert from 'node:assert/strict';
import {completedSteps} from '../dist/admin-completed-steps.mjs';
test('only recorded sent messages and captured money complete steps',()=>{
 const o={proof:{version:2},attention:{confirmation:{status:'sent',to:'a'},proofs:[{version:1,kind:'invitation',status:'sent'},{version:2,kind:'invitation',status:'pending'}],shipments:[{id:'tracking',status:'uncertain'}],finance:{summary:{ordered:100,captured:0},mail:[{kind:'payment_receipt',status:'sent',key:'receipt'},{kind:'accountant_basis',status:'review',key:'basis'}]}}};
 const rows=completedSteps(o);assert.ok(rows.some(r=>r.title==='Ordrebekræftelse sendt'));assert.ok(rows.some(r=>r.title==='Betalingskvittering sendt'));assert.ok(!rows.some(r=>/Korrekturmail|Trackingmail|hævet|bogholder/.test(r.title)));
});
test('current decisions and PF acknowledgement are separate completion steps',()=>{
 const o={proof:{version:2},decision:{version:1,actor:'customer',decision:'approve',delivery:{reference:'old'}}};
 assert.equal(completedSteps(o).length,1);o.decision.version=2;
 assert.ok(completedSteps(o).some(r=>r.id==='pf-sent'));assert.ok(!completedSteps(o).some(r=>r.id==='pf-approved'||r.id==='staff-approved'));
 o.proof.approvalReference='ack';assert.ok(completedSteps(o).some(r=>r.id==='pf-approved'));
});
test('new basis version is not marked sent by an older PDF',()=>{
 const o={attention:{documents:{documents:[{id:'old',type:'basis',version:1},{id:'new',type:'basis',version:2}]},correspondence:[{kind:'email',status:'sent',audience:'accountant',documentId:'old'}]}};
 assert.equal(completedSteps(o).length,0);o.attention.correspondence[0].documentId='new';assert.equal(completedSteps(o).length,1);
});
