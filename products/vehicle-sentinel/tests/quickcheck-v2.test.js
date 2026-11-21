const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const htmlPath=['Vehicle-Sentinel-QuickCheck.html','quickcheck.html'].map(name=>path.join(__dirname,'..',name)).find(fs.existsSync);
assert.ok(htmlPath,'QuickCheck HTML should exist');
const html=fs.readFileSync(htmlPath,'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,1,'Single self-contained JS bundle');
new vm.Script(scripts[0]);
assert.match(html,/does not scan Bluetooth, detect AirTags, or locate GPS trackers/i);
assert.match(html,/Notes remain only in this open tab/i);
assert.match(html,/Clear open-tab entries/i);
assert.match(html,/Resume from a previous JSON report/i);
assert.doesNotMatch(html,/localStorage|sessionStorage|indexedDB/i,'Sensitive observations must not persist in the shared origin');
assert.match(html,/Export JSON/i);
assert.match(html,/Start new inspection/i);
assert.match(html,/support\.apple\.com\/en-us\/119874/);
assert.equal(/<script\s+src=/.test(html),false,'No external scripts');
assert.equal(/(https?:\/\/)(?!support\.apple\.com\/en-us\/119874)[^\s"']+/i.test(html),false,'No external service URL');
assert.equal((html.match(/data-check=/g)||[]).length,6);
const script=scripts[0];
const start=script.indexOf('function normalizeImport(s){');
const end=script.indexOf('\nfunction load()',start);
assert.ok(start>0&&end>start,'Pure JSON report normalization must exist');
const context={};
vm.runInNewContext(
  "const checks=['Seat and storage areas','OBD-II port'].map(check=>({dataset:{check}}));"+
  "const typeSet=new Set(['iPhone alert','Other factual note']);"+
  "const findMyStatuses=new Set(['not-checked','no-alert','alert','uncertain']);"+
  script.slice(start,end)+";globalThis.parse=normalizeImport;",context
);
const report={
  schema:'evercraft.vehicle-sentinel.session.v2',id:'VS-2026-11-16-TEST',
  startedAt:'2026-11-16T12:00:00.000Z',completedAt:null,findMy:'alert',
  checks:['OBD-II port','OBD-II port','unknown'],
  events:[{at:'2026-11-16T12:15:00.000Z',type:'iPhone alert',note:'Observed alert'}],
};
const cleaned=context.parse(report);
assert.equal(cleaned.events.length,1);
assert.deepEqual(Array.from(cleaned.checks),['OBD-II port']);
assert.equal(cleaned.findMy,'alert');
assert.throws(()=>context.parse({...report,events:[{...report.events[0],note:'x'.repeat(2001)}]}),/invalid_observation/);
assert.throws(()=>context.parse({...report,events:[{...report.events[0],at:'not-a-date'}]}),/invalid_observation/);
assert.throws(()=>context.parse({...report,events:Array.from({length:251},()=>report.events[0])}),/unsupported_report/);
assert.throws(()=>context.parse({...report,schema:'unsupported'}),/unsupported_report/);
assert.throws(()=>context.parse({...report,id:'VS-../../private'}),/unsupported_report/);
console.log('PASS: QuickCheck v0.3 memory-only privacy, import sanitization and disclosures');