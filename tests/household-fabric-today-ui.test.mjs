import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('src/HouseholdFabricToday.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const manifest = JSON.parse(fs.readFileSync('public/.well-known/evercraft-household-fabric.json', 'utf8'));

assert.ok(component.includes("fetch('/api/household-fabric/yakima/today'"));
assert.ok(component.includes("We don't have enough trustworthy local data to show this yet."));
assert.ok(component.includes("We'd rather show nothing than give you an old price or a made-up deal."));
assert.ok(component.includes("item.sponsored"));
assert.ok(component.includes("item.sponsor_label"));
assert.ok(component.includes("item.source_url"));
assert.ok(component.includes("No poverty score. No pay-to-rank deals."));
assert.ok(component.includes("Missing data stays missing."));

assert.ok(main.includes("window.location.pathname.startsWith('/household-fabric')"));
assert.ok(main.includes("window.location.pathname.startsWith('/household')"));

assert.ok(server.includes("'</household/>; rel=\"alternate\"; type=\"text/html\"; title=\"Evercraft Household Fabric Today Page\"'"));
assert.ok(server.includes("pathname.startsWith('/household-fabric')"));
assert.ok(server.includes("pathname.startsWith('/household')"));

assert.equal(manifest.human_today_url, '/household/');
assert.equal(manifest.current_capability_state.consumer_today_page, 'implemented_candidate_until_deployed');
assert.equal(manifest.dignity_rules.includes('No poverty score.'), true);
assert.equal(manifest.evidence_rules.includes('Sponsorship does not improve organic ranking.'), true);

console.log('HOUSEHOLD_FABRIC_TODAY_UI_PASS');
