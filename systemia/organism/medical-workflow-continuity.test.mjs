#!/usr/bin/env node
// Regression test: a successful per-run output is not longitudinal memory unless restored AND saved.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('.github/workflows/kaidance-frontier-field.yml','utf8');
const step = (name) => {
  const marker='      - name: '+name+'\n';
  const start=source.indexOf(marker);
  assert.notEqual(start,-1,'missing workflow step: '+name);
  const end=source.indexOf('\n      - name: ',start+marker.length);
  return source.slice(start,end<0?undefined:end);
};

test('KAIDANCE state restore and save both include the same medical triage ledger',()=>{
 const restore=step('Restore KAIDANCE frontier state');
 const save=step('Save KAIDANCE frontier and medical memory');
 for(const file of [
  'artifacts/kaidance-frontier/runtime/state.json',
  'artifacts/medical-evidence-triage/state.json'
 ]){
  assert.ok(restore.includes(file),'restore missing '+file);
  assert.ok(save.includes(file),'save missing '+file);
 }
 assert.match(save,/if: always\(\)/);
});

test('source-bound review packet is tested and archived on successful and failed runs',()=>{
 assert.ok(source.includes('systemia/organism/medical-review-packet*.mjs'));
 assert.ok(source.includes('node systemia/organism/medical-review-packet.test.mjs'));
 const artifact=step('Upload KAIDANCE frontier receipts');
 assert.match(artifact,/if: always\(\)/);
 for(const name of ['latest.json','review.md','index.html']){
  assert.ok(artifact.includes('artifacts/medical-review-packets/'+name));
 }
 assert.ok(source.includes("cron: '*/5 * * * *'"));
 assert.ok(source.includes('kaidance-frontier-field-${{ github.ref }}'), 'PR and production runs must have separate concurrency groups');
});
