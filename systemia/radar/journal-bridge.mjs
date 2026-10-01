const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];

function sourceRecords(edition) {
  const seen = new Map();
  for (const signal of edition?.signals || []) {
    for (const ref of signal.provenance_refs || []) {
      if (!/^https?:\/\//i.test(ref) || seen.has(ref)) continue;
      let publisher = signal.source_family || 'Source';
      try {
        publisher = new URL(ref).hostname.replace(/^www\./, '');
      } catch {}
      seen.set(ref, {
        source_id: `source:${seen.size + 1}`,
        label: publisher,
        publisher,
        url: ref,
        evidence_state: ['OBSERVED', 'CORROBORATED'].includes(signal.truth_state) ? 'verified' : 'reported'
      });
    }
  }
  return [...seen.values()];
}

function sourceIdFor(ref, sources) {
  return sources.find((source) => source.url === ref)?.source_id || null;
}

function groupedSections(edition) {
  const groups = new Map();
  for (const signal of edition?.signals || []) {
    const key = signal.domains?.[0] || 'world';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(signal);
  }

  return [...groups.entries()].map(([domain, signals]) => ({
    heading: domain.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    signals: signals.map((signal) => ({
      signal_id: signal.signal_id,
      summary: signal.summary,
      truth_state: signal.truth_state,
      change_state: signal.change_state,
      materiality_score: signal.materiality_score,
      observed_at: signal.observed_at
    }))
  }));
}

function humanDate(value) {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function radarEditionToEditorialPacket(edition) {
  if (!edition || edition.schema !== 'evercraft.systemia-radar.edition.v1') {
    throw new TypeError('Systemia Radar edition v1 is required');
  }

  const sources = sourceRecords(edition);
  const claims = (edition.signals || []).map((signal) => ({
    claim: signal.summary,
    evidence_state: ['OBSERVED', 'CORROBORATED'].includes(signal.truth_state) ? 'verified' : 'reported',
    truth_state: signal.truth_state,
    change_state: signal.change_state,
    source_refs: unique((signal.provenance_refs || []).map((ref) => sourceIdFor(ref, sources)).filter(Boolean))
  }));

  return {
    schema: 'evercraft.journal.radar-editorial-packet.v1',
    packet_id: `journal:${edition.edition_id}`,
    source_edition_id: edition.edition_id,
    title: 'The World Does Not Update All at Once',
    subtitle: 'Systemia Radar | Reality Before Narrative',
    dek: `A timestamped Systemia Radar scan built from ${edition.signal_count} material changes across ${edition.domains.length || 0} evidence domains.`,
    generated_at: edition.generated_at,
    verification_cutoff: edition.generated_at,
    desk: 'Systemia Radar',
    story_type: 'Evidence brief',
    status: edition.signal_count ? 'editorial_ready' : 'quiet',
    publication_authority: false,
    sources,
    claims,
    sections: groupedSections(edition),
    change_wall: edition.change_wall || [],
    propagation_candidates: edition.propagation_candidates || [],
    evidence_ledger: edition.evidence_ledger || [],
    uncertainty_notes: [
      'This is a timestamped state of evidence, not a permanent description of reality.',
      'Reported claims, forecasts, observations and inference must remain separate in final prose.',
      'Material changes after the verification cutoff belong in the next edition or a visible correction.'
    ],
    required_gates: [
      'source_lineage_complete',
      'political_neutrality_review',
      'causal_language_review',
      'propagation_candidates_remain_inferred_until_mechanism_is_verified',
      'freshness_recheck',
      'visual_rights_verified',
      'journal_editorial_10_of_10_preflight',
      'live_render_qa'
    ],
    next_action: edition.signal_count
      ? 'Compile the long-form Journal story and platform derivatives from this evidence packet, then run the required gates.'
      : 'Do not publish an edition solely to satisfy cadence.'
  };
}

function compactSignal(signal) {
  const state = signal.change_state === 'CORROBORATED'
    ? 'was independently corroborated'
    : signal.change_state === 'INTENSIFIED'
      ? 'intensified'
      : signal.change_state === 'WEAKENED'
        ? 'weakened'
        : signal.change_state === 'CLOSED'
          ? 'closed'
          : signal.change_state === 'CONTESTED'
            ? 'became contested'
            : 'entered the board';
  return `${signal.summary} The signal ${state}; evidence state: ${signal.truth_state.toLowerCase()}.`;
}

export function buildRadarSocialDraft(edition, {
  platform = 'linkedin',
  journal_url = ''
} = {}) {
  if (!edition?.signal_count) {
    return {
      schema: 'evercraft.systemia-radar.social-draft.v1',
      platform,
      status: 'hold',
      reason: 'no_material_signals',
      publication_authority: false,
      copy: ''
    };
  }

  const limit = platform === 'linkedin' ? 2750 : 5200;
  const lead = `SYSTEMIA RADAR | REALITY BEFORE NARRATIVE\n\n${humanDate(edition.generated_at)} Pacific. Radar found ${edition.signal_count} material changes across ${edition.domains.length} evidence domains.\n\n`;
  const close = `\n\nThe point is not to make every signal dramatic. It is to preserve what changed, what the evidence supports, and what remains unresolved. A statement is not an action, a forecast is not an outcome, and yesterday's accurate information does not automatically remain accurate today.\n\nThe deeper evidence ledger and methodology are in the Evercraft Journal${journal_url ? ': ' + journal_url : '.'}`;
  let body = '';

  for (const signal of edition.signals) {
    const paragraph = compactSignal(signal);
    if ((lead + body + '\n\n' + paragraph + close).length > limit) break;
    body += (body ? '\n\n' : '') + paragraph;
  }

  return {
    schema: 'evercraft.systemia-radar.social-draft.v1',
    platform,
    status: 'editorial_ready',
    generated_at: edition.generated_at,
    source_edition_id: edition.edition_id,
    publication_authority: false,
    copy: lead + body + close,
    character_count: (lead + body + close).length,
    rule: 'Platform copy is a derivative of the canonical evidence edition and cannot introduce unsupported claims.'
  };
}
