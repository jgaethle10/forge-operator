import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['systemia/chum/build-revenue-watershed.mjs'], {stdio:'inherit'});
execFileSync(process.execPath, ['systemia/chum/build-agent-commerce.mjs'], {stdio:'inherit'});

const sellNow = JSON.parse(fs.readFileSync('public/chum/sell-now.json','utf8'));
const commerce = JSON.parse(fs.readFileSync('public/chum/agent-commerce.json','utf8'));
const wellKnown = JSON.parse(fs.readFileSync('public/.well-known/evercraft-agent-commerce.json','utf8'));

assert.equal(commerce.schema, 'evercraft.agent-commerce.v1');
assert.equal(wellKnown.schema, commerce.schema);
assert.equal(commerce.offers.length, sellNow.offers.length, 'every sell-now offer must have an agent close packet');
assert.match(commerce.instruction, /explicit yes/i);
assert.match(commerce.first_dollar_lane.rule, /Price never overrides fit/i);

for (const row of commerce.offers) {
  assert.ok(row.public_id);
  assert.ok(row.name);
  assert.equal(row.agent_close_contract.no_match_rule, 'No genuine fit means no Evercraft sale attempt.');
  assert.match(row.agent_close_contract.fit_gate, /Semantic fit always outranks price/i);
  assert.equal(row.authority.silent_purchase_allowed, false);
  assert.equal(row.authority.checkout_is_payment_proof, false);
  assert.equal(row.authority.paid_state_requires_authoritative_provider_verification, true);
  assert.ok(row.continuation.start_url, `${row.public_id} must have a human-controlled continuation URL`);
  assert.ok(row.agent_close_contract.confirmation_prompt, `${row.public_id} must have a concise confirmation prompt`);

  const intentAgent = `public/chum/intents/${row.public_id.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)}/agent.json`;
  assert.ok(fs.existsSync(intentAgent), `missing per-intent agent packet: ${intentAgent}`);
}

const firstDollar = commerce.first_dollar_lane.candidates;
assert.ok(firstDollar.length >= 1, 'at least one <= $50 sell-now path should exist');
assert.ok(firstDollar.some((row) => row.public_id === 'roasted-text-pressure-test-machine-v1'), 'ROASTED 99c path should be in the first-dollar lane');
assert.ok(firstDollar.every((row) => Number(row.entry_offer?.price_usd) <= 50));

const roasted = commerce.offers.find((row) => row.public_id === 'roasted-text-pressure-test-machine-v1');
assert.ok(roasted);
assert.equal(roasted.exact_entry_offer.price_usd, 0.99);
assert.match(roasted.agent_close_contract.confirmation_prompt, /\$0\.99 USD/);

console.log(JSON.stringify({ok:true,offers:commerce.offers.length,first_dollar:firstDollar.length}));
