import crypto from 'node:crypto';
import { normalizeContextObservation } from '../worldstate/observation-fabric.mjs';

const ALLOWED_ACCESS = new Set(['public', 'authorized']);
const COMMERCIAL_GROUPS = new Set([
  'business_registration',
  'domain_birth',
  'permit',
  'hiring',
  'business_listing',
  'procurement',
  'facility_change',
  'ev_infrastructure'
]);

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function stableHash(value) {
  return crypto.createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, 24);
}

function requireText(value, name) {
  const out = clean(value);
  if (!out) throw new TypeError(`${name} is required`);
  return out;
}

function hostname(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0];
  }
}

function templateFingerprint(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '<email>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/[^a-z0-9<> ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized ? stableHash(normalized) : '';
}

function signalGroup(signalType) {
  const type = clean(signalType).toLowerCase();
  const aliases = {
    domain_registration: 'domain_birth',
    dns_first_seen: 'domain_birth',
    search_index_first_seen: 'machine_discovery',
    crawler_visit: 'machine_discovery',
    llm_referral: 'machine_discovery',
    agent_request: 'machine_discovery',
    mcp_request: 'machine_discovery',
    api_probe: 'machine_probe',
    security_scan: 'machine_probe',
    whois_contact: 'commercial_outreach',
    sales_outreach: 'commercial_outreach',
    automated_outreach: 'commercial_outreach',
    company_registration: 'business_registration',
    contractor_license: 'business_registration',
    building_permit: 'permit',
    job_posting: 'hiring',
    google_business_listing: 'business_listing',
    procurement_notice: 'procurement',
    facility_opening: 'facility_change',
    facility_expansion: 'facility_change',
    ev_charger_application: 'ev_infrastructure'
  };
  return aliases[type] || type || 'machine_activity';
}

export function normalizeMachineObservation(raw = {}) {
  const sourceAccess = clean(raw.source_access).toLowerCase();
  if (!ALLOWED_ACCESS.has(sourceAccess)) {
    throw new TypeError('source_access must be public or authorized');
  }
  if (raw.contains_private_data === true) {
    throw new TypeError('Machine Rockies admit minimized observations, not raw private data');
  }

  const signalType = requireText(raw.signal_type || raw.kind, 'signal_type').toLowerCase();
  const targetEntity = requireText(raw.target_entity, 'target_entity').toLowerCase();
  const group = signalGroup(signalType);
  const actorDomain = hostname(raw.actor_domain || raw.actor_host);
  const destinationHost = hostname(raw.destination_host || raw.destination_url);
  const template = templateFingerprint(raw.template_text || raw.message_template || '');

  const correlationKeys = [
    `machine-target:${targetEntity}`,
    `machine-group:${group}`,
    actorDomain ? `machine-actor:${actorDomain}` : '',
    template ? `machine-template:${template}` : '',
    destinationHost ? `machine-destination:${destinationHost}` : ''
  ].filter(Boolean);

  const summary = clean(raw.summary || `${signalType} observed for ${targetEntity}`).slice(0, 1000);

  return normalizeContextObservation({
    source_system: 'systemia-machine-rockies',
    source_family: requireText(raw.source_family, 'source_family'),
    observed_at: raw.observed_at || new Date().toISOString(),
    region_keys: raw.region_keys || ['internet'],
    domains: ['machine_activity', group],
    kind: signalType,
    evidence_state: clean(raw.evidence_state || 'observed').toLowerCase(),
    reliability: clamp01(raw.reliability, 0.5),
    anomaly_score: clamp01(raw.anomaly_score, 0),
    summary,
    provenance_refs: raw.provenance_refs || [raw.provenance_ref].filter(Boolean),
    correlation_keys: correlationKeys,
    facts: {
      target_entity: targetEntity,
      signal_group: group,
      actor_domain: actorDomain || null,
      destination_host: destinationHost || null,
      template_fingerprint: template || null
    },
    metadata: {
      observer_class: 'machine_rocky',
      source_access: sourceAccess,
      data_minimized: true,
      autonomous_contact: false,
      autonomous_purchase: false,
      autonomous_claim: false
    }
  });
}

function machineFacts(observation) {
  return observation?.facts && typeof observation.facts === 'object'
    ? observation.facts
    : {};
}

export function correlateMachineCampaigns(observations = []) {
  const buckets = new Map();

  for (const observation of observations) {
    const facts = machineFacts(observation);
    if (facts.signal_group !== 'commercial_outreach') continue;
    if (!facts.template_fingerprint) continue;

    const key = facts.template_fingerprint;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(observation);
  }

  return [...buckets.entries()].map(([templateFingerprintValue, rows]) => {
    const actors = [...new Set(rows.map((row) => machineFacts(row).actor_domain).filter(Boolean))];
    const targets = [...new Set(rows.map((row) => machineFacts(row).target_entity).filter(Boolean))];
    const destinations = [...new Set(rows.map((row) => machineFacts(row).destination_host).filter(Boolean))];
    const sourceFamilies = [...new Set(rows.map((row) => row.source_family).filter(Boolean))];

    const rotatingActors = actors.length >= 2;
    const portfolioSpread = targets.length >= 2;
    const repeatedTarget = targets.length === 1 && rows.length >= 2;
    const coordinated = rotatingActors && (portfolioSpread || repeatedTarget);

    const confidence = clamp01(
      (rotatingActors ? 0.35 : 0) +
      (portfolioSpread ? 0.3 : 0) +
      (repeatedTarget ? 0.2 : 0) +
      (destinations.length === 1 && destinations.length > 0 ? 0.15 : 0) +
      Math.min(0.2, rows.length * 0.04),
      0
    );

    return {
      schema: 'evercraft.machine-rockies.campaign.v1',
      campaign_id: `mrcamp:${stableHash({ templateFingerprintValue, actors, targets, destinations })}`,
      pattern: coordinated ? 'coordinated_outreach_pattern' : 'repeated_outreach_template',
      confidence,
      observation_ids: rows.map((row) => row.observation_id),
      actor_domains: actors,
      target_entities: targets,
      destination_hosts: destinations,
      source_families: sourceFamilies,
      evidence_count: rows.length,
      autonomous_attribution: false,
      rule: 'Pattern correlation is not proof of common ownership, intent, fraud, or malware.'
    };
  });
}

export function scoreCommercialConvergence(observations = []) {
  const byTarget = new Map();

  for (const observation of observations) {
    const facts = machineFacts(observation);
    if (!COMMERCIAL_GROUPS.has(facts.signal_group)) continue;
    const target = facts.target_entity;
    if (!target) continue;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(observation);
  }

  return [...byTarget.entries()].map(([targetEntity, rows]) => {
    const groups = [...new Set(rows.map((row) => machineFacts(row).signal_group))];
    const families = [...new Set(rows.map((row) => row.source_family).filter(Boolean))];
    const directEvidence = rows.filter((row) => row.evidence_state === 'observed' || row.evidence_state === 'verified');

    const eligible = groups.length >= 3 && families.length >= 2 && directEvidence.length >= 2;
    const score = clamp01(
      Math.min(0.5, groups.length * 0.12) +
      Math.min(0.3, families.length * 0.08) +
      Math.min(0.2, directEvidence.length * 0.05),
      0
    );

    return {
      schema: 'evercraft.machine-rockies.commercial-convergence.v1',
      target_entity: targetEntity,
      stage: eligible ? 'opportunity_review_candidate' : groups.length >= 2 ? 'watch' : 'insufficient',
      score,
      signal_groups: groups,
      independent_source_families: families,
      direct_evidence_count: directEvidence.length,
      observation_ids: rows.map((row) => row.observation_id),
      auto_contact_allowed: false,
      qualification_rule: 'A change signal is not a qualified lead. Human-safe opportunity review requires convergent evidence and a real Evercraft capability match.'
    };
  });
}

export function analyzeMachineObservations(rawObservations = []) {
  const observations = rawObservations.map((row) =>
    row?.schema === 'evercraft.context.observation.v1'
      ? structuredClone(row)
      : normalizeMachineObservation(row)
  );

  const campaigns = correlateMachineCampaigns(observations);
  const opportunities = scoreCommercialConvergence(observations);

  const routes = [
    ...campaigns
      .filter((row) => row.pattern === 'coordinated_outreach_pattern')
      .map((row) => ({
        route: 'security_review',
        reason: row.pattern,
        reference_id: row.campaign_id,
        auto_action: false
      })),
    ...opportunities
      .filter((row) => row.stage === 'opportunity_review_candidate')
      .map((row) => ({
        route: 'opportunity_fabric_review',
        reason: 'multi_signal_commercial_change',
        reference_id: row.target_entity,
        auto_action: false
      }))
  ];

  return {
    schema: 'evercraft.machine-rockies.analysis.v1',
    observations,
    campaigns,
    opportunities,
    routes,
    doctrine: {
      missing_is_not_negative: true,
      modeled_is_not_observed: true,
      repeated_copy_is_not_independent_evidence: true,
      no_autonomous_external_contact: true,
      no_auth_bypass: true
    }
  };
}
