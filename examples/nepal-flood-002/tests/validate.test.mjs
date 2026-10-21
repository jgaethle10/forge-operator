import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validate, parseCsv, INCIDENT_ID } from '../validate.mjs';

const original = fs.readFileSync(new URL('../data/crossings.csv',import.meta.url),'utf8');
const lines = original.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
const substitute=(from,to)=>original.replace(from,to);

test('source pack is valid, six candidates and zero validated routes',()=>{
  const r=validate(original);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.equal(r.record_count,6);
  assert.equal(r.unique_structures_confirmed,0);
  assert.equal(r.geometries_validated,0);
  assert.equal(r.route_clearances,0);
  assert.equal(r.candidates.every(x=>x.geometry===null && x.route_safety===null),true);
});
test('correctly handles UTF-8 BOM and quoted commas',()=>{
  const r=parseCsv('\uFEFFa,b\r\n"one, two","three"\r\n');
  assert.deepEqual(r,[['a','b'],['one, two','three']]);
});
test('rejects wrong incident even with otherwise valid evidence',()=>{
  const r=validate(substitute(INCIDENT_ID,'nepal-rasuwa-flood-2026-08-26'));
  assert.equal(r.ok,false);
  assert.equal(r.errors.some(x=>x.field==='incident_id'),true);
});
test('rejects falsely confirmed structure or geometry',()=>{
  assert.equal(validate(substitute(',NO,,,NOT PROVIDED,NOT DETERMINED',',YES,,,NOT PROVIDED,NOT DETERMINED')).ok,false);
  assert.equal(validate(substitute(',NO,,,NOT PROVIDED,NOT DETERMINED',',NO,28.1,84.9,NOT PROVIDED,NOT DETERMINED')).ok,false);
});
test('rejects route clearance claims derived from reports',()=>{
  const r=validate(substitute('NOT PROVIDED,NOT DETERMINED','NOT PROVIDED,OPEN'));
  assert.equal(r.ok,false);
  assert.equal(r.errors.some(x=>x.field==='public_route_status'),true);
});
test('requires HTTPS attribution and explicit review questions',()=>{
  assert.equal(validate(substitute('https://radionepalonline.com','http://radionepalonline.com')).ok,false);
  assert.equal(validate(substitute('Possible alias with Nyakchet–Philim; verify exact OSM ID','')).ok,false);
});
test('rejects duplicate candidate IDs',()=>{
  const r=validate(substitute('BG-003','BG-002'));
  assert.equal(r.ok,false);
  assert.equal(r.errors.some(x=>x.message==='Duplicate candidate ID'),true);
});
test('rejects wrong headers, malformed quoting and invalid date',()=>{
  assert.equal(validate(substitute('candidate_id,','wrong_id,')).ok,false);
  assert.equal(validate(substitute('2026-10-11','2026-13-11')).ok,false);
  assert.equal(validate(original+'\n"unclosed').ok,false);
});
test('does not add invented cases; requires actual rows',()=>{
  const r=validate(lines[0]+'\n');
  assert.equal(r.ok,false);
  assert.equal(r.record_count,0);
});
