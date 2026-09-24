import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_CATALOG_URL =
  process.env.EVERCRAFT_PUBLIC_MACHINE_CATALOG_URL ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway?action=catalog';

const SYSTEMIA_CATALOG_URL =
  process.env.EVERCRAFT_SYSTEMIA_CATALOG_URL ||
  'https://systemiacommandcenters.com/api/functions/machineCommerceCatalog';

const OUTPUT = 'public/.well-known/evercraft-machine-catalog.json';
const TIMEOUT_MS = 20000;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)])
    );
  }
  return value;
}

function semanticSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { generated_at, public_source_generated_at, ...rest } = snapshot;
  return stable(rest);
}

function asText(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOffer(offer) {
  return {
    public_id: asText(offer.public_id || offer.id),
    name: asText(offer.name),
    intent_terms: asArray(offer.intent_terms).map(String),
    problem: asText(offer.problem),
    inputs: asText(offer.inputs),
    outputs: asText(offer.outputs),
    commercial_state: asText(offer.commercial_state),
    machine_state: asText(offer.machine_state),
    pricing: asText(offer.pricing),
    offers: asArray(offer.offers),
    human_ui_required: Boolean(offer.human_ui_required),
    confirmation: asText(offer.confirmation),
    public_url: asText(offer.public_url),
    payment_authority: asText(offer.payment_authority),
    invocation_status: asText(offer.invocation_status),
    catalog_version: asText(offer.catalog_version),
    updated_at: asText(offer.updated_at)
  };
}

async function fetchJson(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Evercraft-CHUM/0.6 (+catalog-reconcile)'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const [publicLive, systemiaLive] = await Promise.all([
  fetchJson(PUBLIC_CATALOG_URL, 'Public machine catalog'),
  fetchJson(SYSTEMIA_CATALOG_URL, 'Systemia catalog')
]);

const publicRows = Array.isArray(publicLive?.offers) ? publicLive.offers : null;
const systemiaRows = Array.isArray(systemiaLive?.capabilities)
  ? systemiaLive.capabilities
  : Array.isArray(systemiaLive?.offers)
    ? systemiaLive.offers
    : null;

if (publicLive?.ok !== true || !publicRows) {
  throw new Error('Public machine catalog response is invalid.');
}
if (systemiaLive?.ok !== true || !systemiaRows) {
  throw new Error('Systemia catalog response is invalid.');
}

const publicOffers = publicRows.map(normalizeOffer).filter((x) => x.public_id && x.name);
const systemiaOffers = systemiaRows.map(normalizeOffer).filter((x) => x.public_id && x.name);

const systemiaById = new Map(systemiaOffers.map((x) => [x.public_id, x]));
const publicById = new Map(publicOffers.map((x) => [x.public_id, x]));
const mismatchRows = [];
const demotedRows = [];

function differs(a, b) {
  return JSON.stringify(stable(a)) !== JSON.stringify(stable(b));
}

function mergeOverlap(publicOffer, systemiaOffer) {
  const comparedFields = [
    'commercial_state',
    'machine_state',
    'pricing',
    'offers',
    'human_ui_required',
    'confirmation',
    'payment_authority'
  ];

  const mismatches = comparedFields.filter((field) =>
    differs(publicOffer[field], systemiaOffer[field])
  );

  if (mismatches.length) {
    mismatchRows.push({
      public_id: publicOffer.public_id,
      fields: mismatches,
      public_values: Object.fromEntries(
        mismatches.map((field) => [field, publicOffer[field]])
      ),
      systemia_values: Object.fromEntries(
        mismatches.map((field) => [field, systemiaOffer[field]])
      )
    });
  }

  return {
    ...publicOffer,
    name: systemiaOffer.name || publicOffer.name,
    intent_terms: Array.from(
      new Set([...publicOffer.intent_terms, ...systemiaOffer.intent_terms])
    ),
    problem: systemiaOffer.problem || publicOffer.problem,
    inputs: systemiaOffer.inputs || publicOffer.inputs,
    outputs: systemiaOffer.outputs || publicOffer.outputs,

    // Systemia remains the authority boundary for overlapping commercial truth.
    commercial_state:
      systemiaOffer.commercial_state || publicOffer.commercial_state,
    machine_state: systemiaOffer.machine_state || publicOffer.machine_state,
    pricing: systemiaOffer.pricing,
    offers: systemiaOffer.offers,
    human_ui_required: systemiaOffer.human_ui_required,
    confirmation: systemiaOffer.confirmation || publicOffer.confirmation,
    payment_authority:
      systemiaOffer.payment_authority || publicOffer.payment_authority,

    // Public routing may use the freshest verified public status.
    public_url: systemiaOffer.public_url || publicOffer.public_url,
    invocation_status:
      publicOffer.invocation_status || systemiaOffer.invocation_status,
    systemia_invocation_status: systemiaOffer.invocation_status || '',
    systemia_catalog_version: systemiaOffer.catalog_version || '',
    authority_source: 'systemia',
    distribution_source: 'ai_suite_public_mirror',
    reconciliation_state: mismatches.length
      ? 'systemia_authority_applied'
      : 'aligned'
  };
}

const reconciled = [];

for (const publicOffer of publicOffers) {
  const systemiaOffer = systemiaById.get(publicOffer.public_id);

  if (systemiaOffer) {
    reconciled.push(mergeOverlap(publicOffer, systemiaOffer));
    continue;
  }

  // Mirror-only discovery candidates may be surfaced, but they cannot outrun
  // Systemia into sell-now state.
  if (publicOffer.commercial_state === 'sell_now') {
    demotedRows.push({
      public_id: publicOffer.public_id,
      from: 'sell_now',
      to: 'verification_required',
      reason: 'not_present_in_systemia_catalog'
    });

    reconciled.push({
      ...publicOffer,
      commercial_state: 'verification_required',
      machine_state: 'discovery_only',
      pricing:
        'Systemia admission is required before this mirror-only capability may be auto-quoted.',
      offers: [],
      confirmation:
        'Discovery is allowed. Pricing, checkout and paid fulfillment remain disabled until Systemia admits the capability.',
      payment_authority:
        'No machine payment authority until Systemia admission.',
      authority_source: 'systemia_admission_required',
      distribution_source: 'ai_suite_public_mirror',
      reconciliation_state: 'demoted_pending_systemia_admission'
    });
  } else {
    reconciled.push({
      ...publicOffer,
      authority_source: 'ai_suite_discovery_only',
      distribution_source: 'ai_suite_public_mirror',
      reconciliation_state: 'public_only_non_sell_now'
    });
  }
}

for (const systemiaOffer of systemiaOffers) {
  if (publicById.has(systemiaOffer.public_id)) continue;

  reconciled.push({
    ...systemiaOffer,
    authority_source: 'systemia',
    distribution_source: 'systemia_only',
    reconciliation_state: 'systemia_only_not_yet_in_public_mirror'
  });
}

const offers = reconciled
  .filter(
    (x) =>
      x.public_id &&
      x.name &&
      x.commercial_state !== 'superseded'
  )
  .sort((a, b) => a.public_id.localeCompare(b.public_id));

const next = {
  schema: 'evercraft.machine-catalog.snapshot.v3',
  provider: 'Evercraft LLC',
  purpose:
    'Public-safe reconciled snapshot for AI/search/agent discovery. AI Suite contributes distribution breadth; Systemia remains authoritative for overlapping commercial state and any mirror-only sell-now candidate is demoted until admitted.',
  public_source_url: PUBLIC_CATALOG_URL,
  canonical_authority_url: SYSTEMIA_CATALOG_URL,
  public_source_schema_version: asText(publicLive.schema_version),
  public_gateway_version: asText(publicLive.gateway_version),
  public_source_generated_at: asText(publicLive.generated_at),
  systemia_schema_version: asText(systemiaLive.schema_version),
  generated_at: new Date().toISOString(),
  offer_count: offers.length,
  sell_now_count: offers.filter((x) => x.commercial_state === 'sell_now').length,
  discovery_count: offers.filter((x) => x.commercial_state !== 'sell_now').length,
  reconciliation: {
    public_source_count: publicOffers.length,
    systemia_count: systemiaOffers.length,
    overlap_count: publicOffers.filter((x) =>
      systemiaById.has(x.public_id)
    ).length,
    public_only_count: publicOffers.filter(
      (x) => !systemiaById.has(x.public_id)
    ).length,
    systemia_only_count: systemiaOffers.filter(
      (x) => !publicById.has(x.public_id)
    ).length,
    mismatched_overlap_count: mismatchRows.length,
    demoted_unadmitted_sell_now_count: demotedRows.length,
    mismatch_rows: mismatchRows,
    demoted_rows: demotedRows
  },
  safety: {
    discovery_creates_obligation: false,
    human_confirmation_required_for_checkout: true,
    checkout_is_payment_proof: false,
    provider_verification_required_for_paid_state: true,
    private_topology_exposed: false,
    systemia_authority_wins_on_overlap: true,
    mirror_only_sell_now_is_demoted: true,
    ...(publicLive.safety && typeof publicLive.safety === 'object'
      ? publicLive.safety
      : {}),
    ...(systemiaLive.rules && typeof systemiaLive.rules === 'object'
      ? systemiaLive.rules
      : {})
  },
  offers
};

let current = null;
if (fs.existsSync(OUTPUT)) {
  try {
    current = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  } catch {}
}

if (
  current &&
  JSON.stringify(semanticSnapshot(current)) ===
    JSON.stringify(semanticSnapshot(next))
) {
  console.log(
    JSON.stringify({
      changed: false,
      offer_count: offers.length,
      sell_now_count: next.sell_now_count,
      mismatch_count: mismatchRows.length,
      demoted_count: demotedRows.length,
      output: OUTPUT
    })
  );
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(next, null, 2) + '\n');
  console.log(
    JSON.stringify({
      changed: true,
      offer_count: offers.length,
      sell_now_count: next.sell_now_count,
      mismatch_count: mismatchRows.length,
      demoted_count: demotedRows.length,
      output: OUTPUT
    })
  );
}
