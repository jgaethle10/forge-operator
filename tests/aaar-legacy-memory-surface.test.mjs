// Read-only source-level QA for the staged FindMyPart industrial-memory sample.
// Does not claim the page is published, deployed, or externally browser-tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const example=readFileSync(new URL('../public/findmypart/sample-report/industrial-memory/index.html',import.meta.url),'utf8');
const parent=readFileSync(new URL('../public/findmypart/sample-report/index.html',import.meta.url),'utf8');

test('research preview and parent sample remain held from indexing',()=>{
  for(const html of [example,parent]) assert.match(html,/name="robots"\s+content="noindex,nofollow"/i);
});
test('existing FindMyPart sample links to the new evidence-led example',()=>{
  assert.match(parent,/href="\/findmypart\/sample-report\/industrial-memory\/"/);
  assert.match(example,/href="\/findmypart\/"/);
});
test('preview is standalone and cannot send or purchase',()=>{
  assert.doesNotMatch(example,/<(?:script|iframe|form)\b/i);
  assert.doesNotMatch(example,/checkout\.stripe\.com|automatic purchase|buy now/i);
});
test('preview retains exact part numbers and distinct interface language',()=>{
  for(const x of ['FPCI-256MB-2162TM2','FPCI-256MB-4162TM2','PIO 4','UDMA','End of life'])
    assert.ok(example.includes(x), 'Missing '+x);
});
test('original Siemens manual and 8 MB constraint remain visible',()=>{
  assert.match(example,/https:\/\/cache\.industry\.siemens\.com\/dl\/files\/676\/28515676\//);
  assert.match(example,/up to\s*<strong>8 MB<\/strong>/);
  assert.match(example,/have <strong>not<\/strong> been confirmed as suitable replacements/);
});
test('supplier warranty disagreement is explicitly unresolved',()=>{
  assert.match(example,/3 years/i);
  assert.match(example,/5 years/i);
  assert.match(example,/three years/i);
  assert.match(example,/five years/i);
  assert.match(example,/supplier must confirm/i);
});
test('public-source links are present without external script dependencies',()=>{
  assert.match(example,/https:\/\/www\.californiapc\.com\//);
  assert.match(example,/rel="noopener noreferrer"/);
});
test('preview never claims a customer or verified fitment',()=>{
  assert.match(example,/not a customer case or sales quote/i);
  assert.match(example,/No actual customer equipment was examined/i);
  assert.match(example,/no installation or safety-critical compatibility is claimed/i);
});
