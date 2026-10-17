import fs from 'node:fs';
import {withOwnedNativeWorkflowXray} from '../systemia/chum/owned-native-offer-overlay.mjs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = (m) => { throw new Error(m); };

const machine = readJson('public/.well-known/evercraft-machine-catalog.json');
const capabilities = readJson('public/chum/capabilities.json');
const sellNow = readJson('public/chum/sell-now.json');
const sellNowText = fs.readFileSync('public/chum/sell-now.txt', 'utf8');

const canonical = withOwnedNativeWorkflowXray(machine.offers || []).filter((x) => x?.public_id && x?.name);
const canonicalSellNow = canonical.filter((x) => x.commercial_state === 'sell_now');

if (capabilities.schema !== 'evercraft.chum.capabilities.v1') fail('unexpected capabilities schema');
if (sellNow.schema !== 'evercraft.chum.sell-now.v1') fail('unexpected sell-now schema');
if (capabilities.count !== canonical.length) fail(`capability count mismatch: ${capabilities.count} != ${canonical.length}`);
if (sellNow.count !== canonicalSellNow.length) fail(`sell-now count mismatch: ${sellNow.count} != ${canonicalSellNow.length}`);
if ((capabilities.capabilities || []).length !== canonical.length) fail('capabilities array length mismatch');
if ((sellNow.offers || []).length !== canonicalSellNow.length) fail('sell-now array length mismatch');

const capabilityIds = new Set((capabilities.capabilities || []).map((x) => x.public_id));
const sellNowIds = new Set((sellNow.offers || []).map((x) => x.public_id));

for (const offer of canonical) {
  if (!capabilityIds.has(offer.public_id)) fail(`missing capability: ${offer.public_id}`);
}
for (const offer of canonicalSellNow) {
  if (!sellNowIds.has(offer.public_id)) fail(`missing sell-now offer: ${offer.public_id}`);
  if (!sellNowText.includes(offer.name)) fail(`sell-now text missing offer name: ${offer.name}`);
  const compact = (sellNow.offers || []).find((x) => x.public_id === offer.public_id);
  if (!compact) fail(`missing compact sell-now offer: ${offer.public_id}`);
  if (JSON.stringify(compact.offers || []) !== JSON.stringify(offer.offers || [])) {
    fail(`structured tier mismatch: ${offer.public_id}`);
  }
  const canonicalPaidTiers = (offer.offers || []).filter((tier) => {
    const numeric = Number(tier?.price_usd);
    if (Number.isFinite(numeric) && numeric > 0) return true;
    const raw = String(tier?.price || '');
    const match = raw.match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
    return Boolean(match && Number(match[1].replace(/,/g,'')) > 0);
  });
  if (canonicalPaidTiers.length && !compact.entry_paid_offer) {
    fail(`sell-now offer missing entry_paid_offer: ${offer.public_id}`);
  }
  const startUrl = String(compact.start_url || '');
  const heldNoOwnedOrigin = compact.start_url_state === 'held_no_owned_public_origin';
  if (startUrl) {
    if (!startUrl.startsWith('https://')) fail(`sell-now offer Start URL is not absolute HTTPS: ${offer.public_id}`);
    if (/https?:\/\/(?:base44\.app|[^/]+\.base44\.app)(?:\/|$)/i.test(startUrl)) {
      fail(`retired provider leaked into Start URL: ${offer.public_id}`);
    }
  } else if (!heldNoOwnedOrigin) {
    fail(`sell-now offer lacks a verified owned Start URL without an explicit held state: ${offer.public_id}`);
  }

  if (heldNoOwnedOrigin) {
    if (compact.machine_review_url) fail(`held offer must not expose an unverified machine review URL: ${offer.public_id}`);
    if (compact.agent_handoff) fail(`held offer must not expose an executable agent handoff: ${offer.public_id}`);
  } else if (offer.public_id === 'workflow-foundry-xray-v1') {
    // Existing first-party paid offer, not a simulated Machine Commerce offer.
    // Its native human buyer URL is independently observed; no executable
    // agent-side checkout authority, gateway receipt or paid state is claimed.
    const buyerUrl='https://fabric.systemiacommandcenters.com/offers/workflow-xray';
    if (compact.start_url_state !== 'owned_direct_human_start' || startUrl !== buyerUrl) {
      fail('native Workflow X-Ray lost verified owned buyer start');
    }
    if (compact.entry_paid_offer?.offer_key !== 'workflow_foundry.xray_250.v1' ||
        compact.entry_paid_offer?.price_usd_normalized !== 250) {
      fail('native Workflow X-Ray payment contract drifted');
    }
    if (compact.agent_handoff !== null || compact.machine_offer_url !== null ||
        compact.machine_review_url !== null) {
      fail('native direct buyer path must not fabricate a Machine Commerce agent authority');
    }
    if (!/buyer confirmation/i.test(String(offer.confirmation || '')) ||
        !/provider-paid receipt/i.test(String(offer.confirmation || ''))) {
      fail('native Workflow X-Ray lost consent or paid-verification boundary');
    }
  } else {
    if (!compact.agent_handoff || typeof compact.agent_handoff !== 'object') {
      fail(`sell-now offer missing agent_handoff: ${offer.public_id}`);
    }
    if (!String(compact.agent_handoff?.continue_via?.human_start_url || '').startsWith('https://')) {
      fail(`sell-now offer agent handoff missing human Start URL: ${offer.public_id}`);
    }
    if (!String(compact.agent_handoff?.continue_via?.machine_offer_url || '').startsWith('https://')) {
      fail(`sell-now offer agent handoff missing machine offer URL: ${offer.public_id}`);
    }
    if (!String(compact.agent_handoff?.continue_via?.universal_mcp || '').startsWith('https://')) {
      fail(`sell-now offer agent handoff missing universal MCP: ${offer.public_id}`);
    }
    if (!/explicit human confirmation/i.test(String(compact.agent_handoff?.consent_gate || ''))) {
      fail(`sell-now offer agent handoff lost explicit confirmation gate: ${offer.public_id}`);
    }
    if (!/authoritative provider verification/i.test(String(compact.agent_handoff?.completion_rule || ''))) {
      fail(`sell-now offer agent handoff lost payment verification rule: ${offer.public_id}`);
    }
    if (!String(compact.machine_review_url || '').startsWith('https://')) {
      fail(`sell-now offer missing machine review URL: ${offer.public_id}`);
    }
    if (compact.start_url_state === 'machine_commerce_review_fallback' && compact.start_url !== compact.machine_review_url) {
      fail(`fallback Start URL does not equal proven review door: ${offer.public_id}`);
    }
  }
  if (String(compact.start_url || '').startsWith('/api/chum/go/')) {
    fail(`unproven relative CHUM handoff leaked into public Start URL: ${offer.public_id}`);
  }

  const slug = String(offer.public_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const painPagePath = `public/chum/intents/${slug}/index.html`;
  if (!fs.existsSync(painPagePath)) fail(`sell-now pain page missing: ${offer.public_id}`);
  const painPage = fs.readFileSync(painPagePath, 'utf8');
  const held = compact.start_url_state === 'held_no_owned_public_origin';
  if (held) {
    if (!painPage.includes('Start held:')) fail(`held sell-now pain page missing explicit blocker: ${offer.public_id}`);
    if (painPage.includes('<strong>Start here</strong>')) fail(`held sell-now pain page leaked executable Start CTA: ${offer.public_id}`);
  } else if (!painPage.includes('Start here')) {
    fail(`sell-now pain page missing Start CTA: ${offer.public_id}`);
  }
  if (canonicalPaidTiers.length && !painPage.includes('Easiest paid entry:')) {
    fail(`sell-now pain page missing entry offer: ${offer.public_id}`);
  }
}
for (const offer of sellNow.offers || []) {
  if (offer.commercial_state !== 'sell_now') fail(`non-sell-now offer leaked into sell-now directory: ${offer.public_id}`);
  if (!String(offer.problem || '').trim()) fail(`sell-now offer missing problem: ${offer.public_id}`);
  if (!String(offer.pricing || '').trim()) fail(`sell-now offer missing pricing: ${offer.public_id}`);
  if (!Array.isArray(offer.intent_terms) || offer.intent_terms.length < 1) fail(`sell-now offer missing intent language: ${offer.public_id}`);
  if (!String(offer.public_url || '').startsWith('http')) fail(`sell-now offer missing public URL: ${offer.public_id}`);
  if (/https?:\/\/(?:base44\.app|[^/]+\.base44\.app)(?:\/|$)/i.test(String(offer.public_url || ''))) {
    fail(`retired provider leaked into public URL: ${offer.public_id}`);
  }
  if (offer.public_id === 'aliev-site-opportunity-snapshot-v1' &&
      !String(offer.public_url || '').startsWith('https://fabric.systemiacommandcenters.com/capabilities/')) {
    fail('AliEV public URL did not migrate to owned Fabric');
  }
}

console.log(JSON.stringify({
  ok: true,
  capabilities: capabilities.count,
  sell_now: sellNow.count,
  compact_doors: [
    'public/chum/capabilities.json',
    'public/chum/sell-now.json',
    'public/chum/sell-now.txt'
  ]
}));
