import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(fs.readFileSync(path.join(here,'scenarios-2026-10-21.json'),'utf8'));
const html=fs.readFileSync(path.join(here,'scenario-explorer.html'),'utf8');
const embedded=html.match(/<script id="evercraft-scenario-data" type="application\/json">([\s\S]*?)<\/script>/);
const readHtmlData=()=>JSON.parse(embedded?.[1]||'null');

test('scenario IDs and evidence source references are stable',()=>{
 assert.deepEqual(data.scenarios.map(s=>s.id),[3,4,5,6,7,8]);
 const ids=new Set(data.sources.map(s=>s.id));
 assert.equal(ids.size,data.sources.length);
 for(const scenario of data.scenarios){
   assert.ok(scenario.evidence.length>=1);
   assert.ok(scenario.evidence.every(id=>ids.has(id)));
   assert.equal(scenario.model_year,2045);
   assert.equal(scenario.numeric_status,'secondary_reported_oct2026_not_primary_verified');
 }
});

test('modeled changes are derived correctly from 2045 with-dams reference',()=>{
 const baseline=data.scenarios[0];
 assert.equal(baseline.id,3);
 assert.equal(baseline.annual_shipping_cost_musd,256.8);
 for(const s of data.scenarios){
   assert.ok(Number.isFinite(s.annual_shipping_cost_musd));
   assert.ok(Number.isFinite(s.transport_co2_tpy));
   assert.ok(Math.abs((s.annual_shipping_cost_musd-baseline.annual_shipping_cost_musd)-s.annual_shipping_delta_musd)<0.000001);
   assert.equal(s.transport_co2_tpy-baseline.transport_co2_tpy,s.co2_delta_tpy);
 }
});

test('explorer embeds exactly the canonical data snapshot',()=>{
 assert.ok(embedded,'Embedded standalone JSON exists');
 assert.deepEqual(readHtmlData(),data,'Standalone snapshot drifted from machine-readable research data');
 assert.match(html,/study\.scenarios\.map\(/,'Chart must render from canonical dataset');
 assert.doesNotMatch(html,/const cases=\[/,'Do not hand-copy scenario numbers into the visualization');
 assert.match(html,/type="application\/json"/);
});

test('unverified primary October tables, GHG units and capex accounting remain gated',()=>{
 assert.equal(data.original_october_scenario_tables_verified,false);
 assert.equal(data.publication_gate.original_october_numeric_table,'required');
 assert.equal(data.publication_gate.units_and_gases_verification,'required');
 assert.equal(data.publication_gate.editorial_10_of_10,'required');
 assert.equal(data.publication_gate.human_release,'required');
 assert.match(data.units.transport_co2,/unverified/);
 assert.match(html,/SECONDARY REPORTED ESTIMATES/);
 assert.match(html,/Human editorial and release authorization required/);
 assert.match(data.shared_repair_in_kind.description,/DO NOT ADD AGAIN/);
 assert.equal(data.scenarios.find(s=>s.id===5).disputed_capital_ranges_billion_usd.length,2);
});

test('research explorer has useful standalone controls and does not depend on Base44',()=>{
 assert.match(html,/id="cost"/);
 assert.match(html,/id="ghg"/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/wsdot\.wa\.gov/);
 assert.match(html,/wcgazette\.com/);
 assert.doesNotMatch(html,/<script\s+src=/i);
 assert.doesNotMatch(html,/\.base44\.app/i);
});
