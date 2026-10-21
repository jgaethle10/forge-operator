import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFabricCheckoutDirt } from '../scripts/classify-fabric-checkout-dirt.mjs';

test('clean checkout stays clean',()=>{
  const result=classifyFabricCheckoutDirt('');
  assert.equal(result.clean,true);
  assert.equal(result.journal_dirty,false);
  assert.deepEqual(result.blocking_lines,[]);
});

test('generated Journal drift is identified for the updater to hold without deletion',()=>{
  const result=classifyFabricCheckoutDirt([
    ' M public/journal/index.json',
    ' M public/journal/college-football-power-rankings-2026-10-06/index.html',
    '?? public/journal/tmp-preview.html',
  ].join('\n'));
  assert.equal(result.generated_only,true);
  assert.equal(result.journal_dirty,true);
  assert.equal(result.blocking_lines.length,0);
});

test('ordinary generated artifacts remain non-blocking',()=>{
  const result=classifyFabricCheckoutDirt('?? artifacts/latest-receipt.json\n');
  assert.equal(result.generated_only,true);
  assert.equal(result.journal_dirty,false);
  assert.equal(result.blocking_lines.length,0);
});

test('real source changes still block unattended edge updates',()=>{
  const result=classifyFabricCheckoutDirt([
    ' M systemia/mcp/fabric-local-runtime.mjs',
    ' M public/journal/index.json',
  ].join('\n'));
  assert.equal(result.journal_dirty,true);
  assert.deepEqual(result.blocking_lines,[' M systemia/mcp/fabric-local-runtime.mjs']);
});

test('rename crossing out of generated Journal space is blocking',()=>{
  const result=classifyFabricCheckoutDirt('R  public/journal/old.json -> systemia/newsroom/stories/old.json\n');
  assert.equal(result.generated_only,false);
  assert.equal(result.blocking_lines.length,1);
});
