import crypto from 'node:crypto';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];
const id = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

function evidenceRows(dossier) {
  const radar = (dossier?.evidence_ledger || []).map((row) => ({
    source_family: row.source_family || 'unknown',
    independence_group: row.independence_group || row.source_family || 'unknown',
    evidence_state: String(row.truth_state || 'reported').toLowerCase(),
    relationship: 'context',
    observed_at: row.observed_at,
    summary: dossier.summary,
    provenance_refs: row.provenance_refs || [],
    reliability: row.reliability
  }));
  const research = (dossier?.research_evidence || []).map((row) => ({
    source_family: row.source_family,
    independence_group: row.independence_group || row.source_family,
    evidence_state: row.evidence_state,
    relationship: row.relationship,
    observed_at: row.observed_at,
    summary: row.summary,
    provenance_refs: row.provenance_refs || [],
    reliability: row.reliability,
    claims: row.claims || []
  }));
  return [...radar, ...research];
}

function sourceCandidates(dossier) {
  const rows = evidenceRows(dossier);
  return rows.map((row) => ({
    source_id: 'towi-source:' + id({
      family: row.source_family,
      group: row.independence_group,
      refs: row.provenance_refs
    }),
    source_family: row.source_family,
    independence_group: row.independence_group,
    evidence_state: row.evidence_state,
    relationship: row.relationship,
    observed_at: row.observed_at,
    reliability: row.reliability,
    urls: unique(row.provenance_refs),
    summary: clean(row.summary),
    claims: Array.isArray(row.claims) ? row.claims : []
  })).filter((row) => row.urls.length);
}

export function buildTowiProductionPacket(dossier, { now = new Date().toISOString() } = {}) {
  if (!dossier) {
    return {
      status: 'hold',
      reason: 'dossier_missing',
      packet: null
    };
  }
  if (dossier.readiness?.status !== 'editorial_candidate') {
    return {
      status: 'hold',
      reason: 'dossier_not_editorial_candidate',
      dossier_id: dossier.dossier_id,
      packet: null
    };
  }

  const sources = sourceCandidates(dossier);
  const independenceGroups = new Set(sources.map((row) => clean(row.independence_group).toLowerCase()).filter(Boolean));
  if (independenceGroups.size < 2 && Number(dossier.readiness?.independent_source_families || 0) < 2) {
    return {
      status: 'hold',
      reason: 'independent_source_gate_not_met',
      dossier_id: dossier.dossier_id,
      packet: null
    };
  }

  const warnings = unique(dossier.readiness?.warnings || []);
  const packet = {
    schema: 'evercraft.towi.production-packet.v1',
    packet_id: 'towi-production:' + id({
      dossier_id: dossier.dossier_id,
      updated_at: dossier.updated_at,
      source_ids: sources.map((row) => row.source_id)
    }),
    generated_at: now,
    dossier_id: dossier.dossier_id,
    story_type: dossier.story_type,
    title_seed: dossier.title_seed,
    summary: dossier.summary,
    score: dossier.score,
    domains: dossier.domains || [],
    region_keys: dossier.region_keys || [],
    truth_state: dossier.truth_state,
    change_state: dossier.change_state,
    sources,
    research_questions: dossier.research_questions || [],
    uncertainty_and_review: {
      warnings,
      requires_human_editorial_review: Boolean(dossier.readiness?.requires_human_editorial_review),
      contradiction_present: warnings.includes('contradictory_or_challenging_evidence_present')
    },
    journal_candidate: {
      schema: 'evercraft.journal.towi-candidate.v1',
      status: 'draft_candidate',
      desk: 'TOWI',
      story_type: dossier.story_type,
      title_seed: dossier.title_seed,
      dek_seed: dossier.summary,
      source_ids: sources.map((row) => row.source_id),
      evidence_state: dossier.truth_state,
      research_questions: dossier.research_questions || [],
      required_next_gate: 'journal_editorial_10_of_10_preflight',
      publication_authority: false
    },
    fallen_brief_seed: {
      schema: 'evercraft.fallen.towi-production-seed.v1',
      story_type: dossier.story_type,
      title: dossier.title_seed,
      source_ids: sources.map((row) => row.source_id),
      preferred_visuals: ['verified_capture', 'licensed_media', 'data_visualization'],
      generated_cinematic_allowed_only_when_labeled: true,
      map_or_data_visual_requested: true,
      rule: 'Do not fabricate documentary imagery or imply a generated visual is an observed scene.',
      production_authority: false
    },
    clip_handoff_seed: {
      schema: 'evercraft.clip.towi-handoff-seed.v1',
      source_app: 'towi',
      source_dossier_id: dossier.dossier_id,
      requested_targets: ['journal', 'youtube', 'linkedin', 'facebook', 'instagram', 'tiktok'],
      derivative_types: ['longform_explainer', 'short_video', 'data_visual', 'social_summary'],
      source_ids: sources.map((row) => row.source_id),
      publication_authority: false,
      rule: 'Distribution is downstream of final editorial and rights approval.'
    },
    machine_summary_seed: {
      schema: 'evercraft.towi.machine-summary-seed.v1',
      title: dossier.title_seed,
      summary: dossier.summary,
      story_type: dossier.story_type,
      truth_state: dossier.truth_state,
      change_state: dossier.change_state,
      domains: dossier.domains || [],
      regions: dossier.region_keys || [],
      source_count: sources.length,
      independent_source_families: dossier.readiness?.independent_source_families || 0,
      uncertainty: warnings
    },
    publication_authority: false
  };

  return {
    status: 'pass',
    reason: 'production_packet_staged',
    dossier_id: dossier.dossier_id,
    packet
  };
}

export function buildTowiProductionQueue(dossiers = [], options = {}) {
  const rows = (Array.isArray(dossiers) ? dossiers : [])
    .map((dossier) => buildTowiProductionPacket(dossier, options))
    .filter((row) => row.status === 'pass' && row.packet)
    .map((row) => row.packet);
  return {
    schema: 'evercraft.towi.production-queue.v1',
    generated_at: options.now || new Date().toISOString(),
    packet_count: rows.length,
    packets: rows,
    publication_authority: false
  };
}
