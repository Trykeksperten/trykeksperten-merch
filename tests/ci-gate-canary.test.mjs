// Disposable CI-gate verification. Never merge this branch.
import test from 'node:test';
import assert from 'node:assert/strict';
test('release gate canary must fail to prove required CI blocks merging', () => {
  assert.fail('INTENTIONAL_CI_GATE_CANARY: verify required check blocks merging; then close the verification PR.');
});
