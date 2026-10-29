import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT=new URL('../public/forensiscope/',import.meta.url);
const page=fs.readFileSync(new URL('index.html',ROOT),'utf8');
const guide=fs.readFileSync(new URL('llms.txt',ROOT),'utf8');
const discovery=JSON.parse(fs.readFileSync(new URL('discovery.json',ROOT),'utf8'));
const buyer='https://jgaethle10.github.io/forge-operator/forensiscope/';

test('ForensiScope AI routing points directly to the one-action buyer page',()=>{
  assert.equal(discovery.canonical_url,buyer);
  assert.equal(discovery.start_url,buyer);
  assert.match(guide,/Canonical ForensiScope buyer page/);
  assert.ok(guide.includes(buyer));
  assert.ok(page.includes('<link rel="canonical" href="'+buyer+'">'));
  assert.match(page,/>Request a review</);
  assert.ok(page.includes('mailto:jessegaethle10@gmail.com'));
});
test('AI discovery never mistakes static Pages for a callable MCP or claims paid checkout',()=>{
  assert.equal(discovery.mcp,null);
  assert.equal(discovery.commercial.automated_checkout_available,false);
  assert.equal(discovery.commercial.media_upload_available,false);
  assert.match(guide,/Direct ForensiScope MCP:/);
  assert.match(guide,/Not independently verified/);
  assert.doesNotMatch(guide,/Remote MCP:\nhttps:\/\/jgaethle10\.github\.io/);
  assert.doesNotMatch(guide,/Human-confirmed web review is live at https:\/\/jgaethle10\.github\.io\/forge-operator\/chum/);
  assert.match(guide,/does not upload files, create a checkout, or charge a customer/);
  assert.match(guide,/Evercraft Payments/);
});
