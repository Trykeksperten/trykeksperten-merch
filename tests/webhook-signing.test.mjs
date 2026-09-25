import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyPFRelaySignature} from '../lib/webhook-signing.mjs';

test('PF relay requires a fresh HMAC over exact webhook bytes',()=>{const raw=Buffer.from('{"messageId":"pf-1"}'),secret='test-secret',timestamp='1790000000',now=1790000000000,signature=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');assert.equal(verifyPFRelaySignature(raw,{'x-smerch-timestamp':timestamp,'x-smerch-signature':`sha256=${signature}`},secret,now),true);assert.equal(verifyPFRelaySignature(Buffer.from('{"messageId":"pf-2"}'),{'x-smerch-timestamp':timestamp,'x-smerch-signature':signature},secret,now),false);assert.equal(verifyPFRelaySignature(raw,{'x-smerch-timestamp':timestamp,'x-smerch-signature':signature},secret,now+301000),false);});
