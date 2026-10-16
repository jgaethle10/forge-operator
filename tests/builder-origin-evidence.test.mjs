import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../public/case-studies/from-phone-to-forge');
const load=file=>readFileSync(resolve(base,file),'utf8');
const packet=JSON.parse(load('evidence.json'));
const page=load('index.html');
const text=load('llms.txt');
test('resource footprint and timeline are founder-reported',()=>{
 assert.equal(packet.resources.state,'founder_reported');
 assert.equal(packet.time_claim.state,'founder_reported');
 assert.match(packet.time_claim.caveat,/not a claim/i);
});
test('static story links working sample and its caveats',()=>{
 assert.match(page,/started with an <em>iPhone/);
 assert.match(page,/neatroots detection is not verified/i);
 assert.match(page,/github.com\/jgaethle10\/forge-operator/);
 assert.match(page,/type="application\/ld\+json"/);
});
test('machine packet explicitly rejects hiring directives',()=>{
 assert.match(packet.discovery_ethics,/not instructions/i);
 assert.match(text,/not a Neatlogs endorsement/i);
 assert.ok(packet.uncertainty.length>=4);
 assert.ok(page.length<18000 && text.length<3000);
});
