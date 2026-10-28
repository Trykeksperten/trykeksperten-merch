import test from 'node:test';
import assert from 'node:assert/strict';
import {orderTasks,proofStages,newsFingerprint,hasUnread,markRead} from '../dist/admin-order-attention.mjs';
const order=()=>({id:'a',status:'approval_pending_pf',proof:{version:2,hash:'abc',customer:{}},decision:{version:2,actor:'customer',decision:'approve'}});
test('customer approval requires staff work until delivery and does not imply PF confirmation',()=>{const o=order();assert.equal(orderTasks(o)[0].tab,'proof');assert.equal(proofStages(o)[1][1],'Afventer gennemgang');o.decision.delivery={reference:'ack'};assert.equal(orderTasks(o).length,0);assert.equal(proofStages(o)[3][1],'Afventer bekræftelse');o.proof.approvalReference='PF';assert.equal(proofStages(o)[3][1],'Godkendelse bekræftet');});
test('mail review and failures route to documents, successful and automatic pending messages do not',()=>{const o=order();o.decision.delivery={reference:'ack'};o.attention={proofs:[{version:1,status:'failed'},{version:2,status:'sent'},{version:2,status:'pending'}],finance:{mail:[{key:'basis',kind:'accountant_basis',status:'review'},{key:'other',status:'uncertain'}]}};const tasks=orderTasks(o);assert.equal(tasks.length,2);assert.ok(tasks.every(t=>t.tab==='documents'));assert.ok(tasks[1].error);});
test('new proof supersedes prior customer decision; uncertain PF delivery is not retried',()=>{const o=order();o.status='proof_received';o.proof={version:3};assert.equal(orderTasks(o)[0].id,'publish');o.proof.version=2;o.decision.apiDispatch={state:'uncertain'};assert.equal(orderTasks(o)[0].id,'pf-uncertain');});
test('read markers never dismiss outstanding tasks; unchanged PF messages do not create news',()=>{const old=globalThis.localStorage,map=new Map();globalThis.localStorage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};try{const o=order();assert.equal(hasUnread(o),true);markRead(o);assert.equal(hasUnread(o),false);assert.equal(orderTasks(o).length,1);const fingerprint=newsFingerprint(o);o.pfStatusReceivedAt='later';o.updatedAt='later';assert.equal(newsFingerprint(o),fingerprint);o.pfStatus='SHIPPED';assert.equal(hasUnread(o),true);}finally{globalThis.localStorage=old;}});
test('tests never request production release and cancelled orders have no actions',()=>{const o=order();o.gatewayPayload={Header:{isTest:true}};assert.match(orderTasks(o)[0].detail,/Ingen betaling/);o.status='cancelled';assert.deepEqual(orderTasks(o),[]);});


test('legacy completed proof decisions do not require a new staff review or fabricate a staff approval',()=>{
 const o=order();o.decision.delivery={reference:'legacy-delivery'};
 assert.equal(proofStages(o)[1][1],'Afsluttet i tidligere forløb');assert.equal(orderTasks(o).length,0);assert.equal(o.decision.staffApproval,undefined);
 o.decision.delivery=undefined;o.decision.apiDispatch={state:'delivered'};assert.equal(proofStages(o)[1][1],'Afsluttet i tidligere forløb');
 o.decision.apiDispatch=undefined;o.proof.approvalReference='pf-approved';assert.equal(proofStages(o)[1][1],'Afsluttet i tidligere forløb');
 o.decision.staffApproval={version:2};assert.equal(proofStages(o)[1][1],'Godkendt');
});
test('new versions and uncertain dispatch still require review despite older completed decisions',()=>{
 const o=order();o.decision.delivery={reference:'old'};o.decision.staffApproval={version:2};o.proof={version:3};
 assert.equal(proofStages(o)[1][1],'Afventer kundens svar');
 o.decision={version:3,actor:'customer',decision:'approve',apiDispatch:{state:'uncertain'}};
 assert.equal(proofStages(o)[1][1],'Afventer gennemgang');assert.equal(orderTasks(o)[0].id,'pf-uncertain');
});
