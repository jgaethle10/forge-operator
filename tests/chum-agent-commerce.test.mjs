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
  const held=row.continuation.state==='held_no_owned_public_origin';
  if(held){
    assert.equal(row.continuation.start_url,null,`${row.public_id} held offer must not expose an executable continuation`);
    assert.match(String(row.continuation.public_url||''),/^https:\/\//,`${row.public_id} held offer must retain public discovery details`);
    assert.equal(row.continuation.blocker,'owned_public_execution_origin_not_verified');
    assert.match(row.agent_close_contract.confirmation_prompt,/currently held/i);
    assert.doesNotMatch(row.agent_close_contract.on_explicit_yes,/Continue through start_url/i);
  }else{
    assert.match(String(row.continuation.start_url||''),/^https:\/\//,`${row.public_id} must have a human-controlled continuation URL`);
  }
  assert.ok(row.agent_close_contract.confirmation_prompt, `${row.public_id} must have a concise confirmation prompt`);

  const intentAgent = `public/chum/intents/${row.public_id.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)}/agent.json`;
  assert.ok(fs.existsSync(intentAgent), `missing per-intent agent packet: ${intentAgent}`);
}

const firstDollar = commerce.first_dollar_lane.candidates;
const cheapOffers = commerce.offers.filter((row) =>
  Number.isFinite(row.exact_entry_offer?.price_usd) &&
  row.exact_entry_offer.price_usd <= commerce.first_dollar_lane.max_entry_price_usd
);
const executableCheapOffers = cheapOffers.filter((row) => /^https:\/\//.test(String(row.continuation.start_url||'')));

assert.ok(cheapOffers.length >= 1, 'at least one <= $50 published sell-now offer should exist');
assert.equal(firstDollar.length, executableCheapOffers.length, 'first-dollar lane must contain only currently executable low-price continuations');
assert.deepEqual(
  firstDollar.map((row)=>row.public_id).sort(),
  executableCheapOffers.map((row)=>row.public_id).sort(),
  'first-dollar candidates must exactly match verified executable low-price continuations'
);
assert.ok(firstDollar.every((row) => Number(row.entry_offer?.price_usd) <= 50));
assert.ok(firstDollar.every((row) => /^https:\/\//.test(String(row.start_url||''))), 'first-dollar lane must contain only executable human-confirmed continuations');
if (executableCheapOffers.length===0) {
  assert.equal(firstDollar.length,0,'held owned corridors must not be promoted into first-dollar checkout paths');
  assert.ok(cheapOffers.every((row)=>row.continuation.state==='held_no_owned_public_origin'),'non-executable cheap offers must remain explicitly held');
}

const roasted = commerce.offers.find((row) => row.public_id === 'roasted-text-pressure-test-machine-v1');
assert.ok(roasted);
assert.equal(roasted.exact_entry_offer.price_usd, 0.99);
assert.match(roasted.agent_close_contract.confirmation_prompt, /\$0\.99 USD/);
assert.equal(
  firstDollar.some((row)=>row.public_id==='roasted-text-pressure-test-machine-v1'),
  Boolean(roasted.continuation.start_url),
  'ROASTED belongs in first-dollar lane only when its owned continuation is verified executable'
);

console.log(JSON.stringify({ok:true,offers:commerce.offers.length,first_dollar:firstDollar.length}));
