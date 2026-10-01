import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];
const sha256 = (value) => crypto.createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');
const esc = (value) => clean(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const POLITICAL_DOMAINS = new Set(['politics', 'government', 'public_policy', 'regulation', 'elections']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function atomicWrite(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function slugDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function humanDate(value) {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function hasPoliticalSignals(edition) {
  return (edition?.signals || []).some((signal) =>
    (signal.domains || []).some((domain) => POLITICAL_DOMAINS.has(clean(domain).toLowerCase()))
  );
}

function allClaimsBound(packet) {
  const sourceIds = new Set((packet?.sources || []).map((source) => clean(source.source_id)));
  return (packet?.claims || []).every((claim) => {
    const refs = unique(claim.source_refs);
    return clean(claim.claim) && refs.length > 0 && refs.every((ref) => sourceIds.has(ref));
  });
}

function proseParagraphs(edition) {
  const signals = edition?.signals || [];
  const opening = `Systemia Radar's ${humanDate(edition.generated_at)} verification cut found ${signals.length} material change${signals.length === 1 ? '' : 's'} across ${edition.domains?.length || 0} evidence domains. The edition does not treat every new datum as a story. It records the state that can be supported at this timestamp, keeps forecasts separate from outcomes, and preserves uncertainty where the evidence has not caught up with the narrative around an event.`;

  const strongest = [...signals]
    .sort((a, b) => Number(b.materiality_score || 0) - Number(a.materiality_score || 0))
    .slice(0, 5);
  const changed = strongest.map((signal) =>
    `${signal.summary} Radar classifies this as ${clean(signal.truth_state).toLowerCase()} evidence and records the state change as ${clean(signal.change_state).toLowerCase()}, with materiality ${Number(signal.materiality_score || 0).toFixed(3)}.`
  ).join(' ');

  const unresolved = signals
    .filter((signal) => ['REPORTED', 'PENDING', 'CONTESTED', 'INFERRED', 'UNKNOWN'].includes(signal.truth_state))
    .map((signal) => `${signal.summary} Its current evidence state remains ${clean(signal.truth_state).toLowerCase()}, so the edition does not promote it beyond that boundary.`)
    .join(' ');

  const propagation = (edition?.propagation_candidates || []).length
    ? `Radar also found ${edition.propagation_candidates.length} cross-domain relationship candidate${edition.propagation_candidates.length === 1 ? '' : 's'}. Those candidates are preserved as inference rather than causation. They exist to tell investigators where several parts of the world may be moving together, not to manufacture a mechanism that the evidence has not demonstrated.`
    : 'Radar did not find a cross-domain relationship candidate that cleared the current context boundary. That quiet result is preserved rather than replaced with a speculative connection.';

  const close = `The useful unit here is not the headline but the change in supported state. Every source remains attached to the claims it supports, every fast-moving signal carries a freshness window, and later evidence can weaken, close, corroborate, contest, or roll a signal off the board. The article therefore functions as a timestamped evidence ledger with narrative around it, not as a permanent declaration about reality.`;

  return {
    opening,
    changed: changed || 'No individual signal was strong enough to support a separate explanatory paragraph in this release.',
    unresolved: unresolved || 'No selected signal required an unresolved-state paragraph in this release. That does not mean uncertainty disappeared; it means no selected claim crossed the edition threshold while remaining in a reported, pending, contested, inferred, or unknown state.',
    propagation,
    close
  };
}

export function evaluateRadarRelease({ edition, editorialPacket } = {}) {
  const gates = [];
  const fail = (id, detail) => gates.push({ id, status: 'hold', detail });
  const pass = (id, detail) => gates.push({ id, status: 'pass', detail });

  if (!edition || edition.schema !== 'evercraft.systemia-radar.edition.v1') {
    fail('edition_present', 'A Systemia Radar edition v1 is required.');
  } else {
    pass('edition_present', edition.edition_id);
  }

  if (!editorialPacket || editorialPacket.schema !== 'evercraft.journal.radar-editorial-packet.v1') {
    fail('editorial_packet_present', 'A Radar editorial packet v1 is required.');
  } else {
    pass('editorial_packet_present', editorialPacket.packet_id);
  }

  const signals = edition?.signals || [];
  if (signals.length > 0) pass('material_signals_present', `${signals.length} material signals`);
  else fail('material_signals_present', 'Quiet editions do not publish for cadence.');

  const sources = editorialPacket?.sources || [];
  if (sources.length >= 2) pass('independent_source_floor', `${sources.length} source records`);
  else fail('independent_source_floor', 'Owned auto-release requires at least two source records.');

  if (allClaimsBound(editorialPacket)) pass('source_lineage_complete', 'Every claim has known source refs.');
  else fail('source_lineage_complete', 'One or more claims are missing valid source refs.');

  const stale = signals.filter((signal) => signal.review?.freshness?.state !== 'fresh');
  if (!stale.length) pass('freshness_recheck', 'All selected signals are fresh at compile time.');
  else fail('freshness_recheck', `${stale.length} selected signals are stale.`);

  const unknown = signals.filter((signal) => signal.truth_state === 'UNKNOWN');
  if (!unknown.length) pass('truth_state_known', 'No selected signal is UNKNOWN.');
  else fail('truth_state_known', `${unknown.length} selected signals remain UNKNOWN.`);

  const badPropagation = (edition?.propagation_candidates || []).filter((candidate) =>
    candidate.truth_state !== 'INFERRED' || candidate.causal_claim !== false
  );
  if (!badPropagation.length) pass('propagation_noncausal', 'Propagation candidates remain inferred and non-causal.');
  else fail('propagation_noncausal', 'A propagation candidate crossed the non-causal boundary.');

  if (!hasPoliticalSignals(edition)) {
    pass('political_auto_release_boundary', 'No political/government signal is selected for unattended release.');
  } else {
    fail('political_auto_release_boundary', 'Political/government signals require a separate sourced editorial review before unattended release.');
  }

  const paragraphs = edition ? proseParagraphs(edition) : null;
  const paragraphLengths = paragraphs ? Object.values(paragraphs).map((value) => clean(value).length) : [];
  if (paragraphLengths.length >= 5 && paragraphLengths.every((length) => length >= 180)) {
    pass('prose_structure', 'Release prose uses developed paragraphs rather than one-line cadence.');
  } else {
    fail('prose_structure', 'One or more release paragraphs are too thin for the Journal standard.');
  }

  const held = gates.filter((gate) => gate.status === 'hold');
  return {
    schema: 'evercraft.systemia-radar.release-gate.v1',
    evaluated_at: new Date().toISOString(),
    edition_id: edition?.edition_id || null,
    status: held.length ? 'hold' : 'ready',
    score: gates.filter((gate) => gate.status === 'pass').length,
    possible_score: gates.length,
    gates,
    blockers: held.map((gate) => gate.id),
    unattended_publication_allowed: held.length === 0
  };
}

export function buildRadarRelease({ edition, editorialPacket, socialDrafts = [] } = {}) {
  const gate = evaluateRadarRelease({ edition, editorialPacket });
  if (gate.status !== 'ready') {
    return {
      schema: 'evercraft.systemia-radar.release-decision.v1',
      status: 'hold',
      gate,
      release: null
    };
  }

  const paragraphs = proseParagraphs(edition);
  const slug = `systemia-radar-${slugDate(edition.generated_at)}-${edition.edition_id.split(':').at(-1).slice(0, 8)}`;
  const sourceRefs = (editorialPacket.sources || []).map((source) => source.source_id);
  const release = {
    schema: 'evercraft.systemia-radar.release.v1',
    release_id: `radar-release:${sha256([edition.edition_id, edition.generated_at]).slice(0, 24)}`,
    source_edition_id: edition.edition_id,
    slug,
    title: `The World Does Not Update All at Once: Systemia Radar, ${new Date(edition.generated_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' })}`,
    dek: editorialPacket.dek,
    generated_at: edition.generated_at,
    verification_cutoff: edition.generated_at,
    status: 'ready',
    desk: 'Systemia Radar',
    story_type: 'Evidence brief',
    evidence_state: 'source_grounded_timestamped',
    publication_authority: 'owned_radar_archive_only',
    signals: structuredClone(edition.signals || []),
    change_wall: structuredClone(edition.change_wall || []),
    propagation_candidates: structuredClone(edition.propagation_candidates || []),
    sources: structuredClone(editorialPacket.sources || []),
    claims: structuredClone(editorialPacket.claims || []),
    sections: [
      { heading: 'Reality has a clock', body: paragraphs.opening },
      { heading: 'What changed', body: paragraphs.changed },
      { heading: 'What remains unresolved', body: paragraphs.unresolved },
      { heading: 'Where the signals may connect', body: paragraphs.propagation },
      { heading: 'The record is designed to move', body: paragraphs.close }
    ],
    uncertainty_notes: structuredClone(editorialPacket.uncertainty_notes || []),
    release_gate: gate,
    visual: {
      kind: 'data_visualization',
      rights_state: 'evercraft_generated_from_cited_public_data',
      source_refs: sourceRefs,
      path: `/radar/releases/${slug}/hero.svg`
    },
    derivatives: (socialDrafts || []).filter((draft) => draft?.status === 'editorial_ready').map((draft) => ({
      platform: draft.platform,
      copy: draft.copy,
      character_count: draft.character_count,
      source_edition_id: draft.source_edition_id
    })),
    correction_policy: {
      enabled: true,
      trigger: 'released signal changes truth state, underlying observation, closes, becomes contested, or rolls off freshness',
      preserve_original: true
    }
  };

  release.content_sha256 = sha256({
    title: release.title,
    sections: release.sections,
    claims: release.claims,
    signals: release.signals
  });

  return {
    schema: 'evercraft.systemia-radar.release-decision.v1',
    status: 'ready',
    gate,
    release
  };
}

export function renderRadarHeroSvg(release) {
  const rows = [...(release?.signals || [])]
    .sort((a, b) => Number(b.materiality_score || 0) - Number(a.materiality_score || 0))
    .slice(0, 6);
  const width = 1400;
  const rowHeight = 112;
  const height = 300 + rows.length * rowHeight;
  const bars = rows.map((signal, index) => {
    const y = 250 + index * rowHeight;
    const score = Math.max(0, Math.min(1, Number(signal.materiality_score || 0)));
    const barWidth = Math.round(score * 760);
    const label = clean(signal.summary).slice(0, 92);
    return `
      <text x="90" y="${y}" fill="#f3f0e9" font-size="28" font-family="system-ui, sans-serif">${esc(label)}</text>
      <text x="90" y="${y + 34}" fill="#9aa6af" font-size="20" font-family="system-ui, sans-serif">${esc(signal.change_state)} · ${esc(signal.truth_state)} · ${score.toFixed(3)}</text>
      <rect x="520" y="${y + 48}" width="760" height="12" rx="6" fill="#232b31"/>
      <rect x="520" y="${y + 48}" width="${barWidth}" height="12" rx="6" fill="#c4a464"/>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(release.title)}</title>
  <desc id="desc">Systemia Radar materiality visualization generated from the cited evidence edition.</desc>
  <rect width="100%" height="100%" fill="#0b0d0f"/>
  <text x="90" y="92" fill="#c4a464" font-size="24" font-family="system-ui, sans-serif" font-weight="700" letter-spacing="4">SYSTEMIA RADAR</text>
  <text x="90" y="154" fill="#f3f0e9" font-size="54" font-family="Georgia, serif">Reality Before Narrative</text>
  <text x="90" y="198" fill="#9aa6af" font-size="22" font-family="system-ui, sans-serif">Verification cutoff ${esc(humanDate(release.verification_cutoff))} Pacific · ${rows.length} displayed material signals</text>
  ${bars}
  <text x="90" y="${height - 36}" fill="#6f7a82" font-size="18" font-family="system-ui, sans-serif">Materiality is an editorial triage score, not a probability or forecast.</text>
</svg>\n`;
}

export function renderRadarReleaseHtml(release) {
  const sections = (release.sections || []).map((section) =>
    `<section><h2>${esc(section.heading)}</h2><p>${esc(section.body)}</p></section>`
  ).join('\n');
  const sourceList = (release.sources || []).map((source) =>
    `<li><a href="${esc(source.url)}" rel="noopener noreferrer">${esc(source.label || source.publisher || source.source_id)}</a> <span>${esc(source.publisher || '')}</span></li>`
  ).join('');
  const ledger = (release.signals || []).map((signal) =>
    `<tr><td>${esc(signal.change_state)}</td><td>${esc(signal.truth_state)}</td><td>${esc(signal.summary)}</td><td>${Number(signal.materiality_score || 0).toFixed(3)}</td></tr>`
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(release.title)} | Evercraft Journal</title>
<meta name="description" content="${esc(release.dek)}">
<style>
:root{color-scheme:dark;--bg:#090b0d;--panel:#12171a;--text:#f3f0e9;--muted:#aab2b9;--line:#293036;--gold:#c4a464;--blue:#8bbbd8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.72}
main,header,footer{width:min(980px,calc(100% - 34px));margin:auto}header{padding:38px 0 26px;border-bottom:1px solid var(--line)}
.kicker{color:var(--gold);font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:.75rem}
h1{font:500 clamp(2.6rem,7vw,5rem)/1 Georgia,serif;letter-spacing:-.045em;margin:.22em 0}.dek{color:#d5d2cb;font-size:1.2rem;max-width:800px}
.meta{color:var(--muted)}main{padding:42px 0 80px}.hero{width:100%;border:1px solid var(--line);border-radius:18px;background:#0b0d0f}
section{margin:44px 0}h2{font:500 1.75rem/1.15 Georgia,serif}p{font-size:1.07rem;color:#e3dfd8}
.box{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin:38px 0}
table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{text-align:left;padding:12px 10px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted)}
a{color:var(--blue)}li{margin:.45em 0}footer{border-top:1px solid var(--line);padding:28px 0 50px;color:var(--muted)}
</style>
</head>
<body>
<header>
<div class="kicker">Systemia Radar · Reality Before Narrative</div>
<h1>${esc(release.title)}</h1>
<p class="dek">${esc(release.dek)}</p>
<p class="meta">Verification cutoff ${esc(humanDate(release.verification_cutoff))} Pacific · Source-grounded timestamped release</p>
</header>
<main>
<img class="hero" src="./hero.svg" alt="Systemia Radar materiality visualization">
${sections}
<div class="box"><h2>Change Wall</h2><div style="overflow:auto"><table><thead><tr><th>Delta</th><th>Evidence</th><th>Signal</th><th>Materiality</th></tr></thead><tbody>${ledger}</tbody></table></div></div>
<div class="box"><h2>What remains uncertain</h2><ul>${(release.uncertainty_notes || []).map((note) => `<li>${esc(note)}</li>`).join('')}</ul></div>
<section><h2>Sources and evidence</h2><ol>${sourceList}</ol></section>
</main>
<footer>Evercraft Journal · This release preserves the state of evidence at a specific verification cutoff. Later evidence may change the record.</footer>
</body>
</html>`;
}

function releaseIndexDefault() {
  return { schema: 'evercraft.systemia-radar.release-index.v1', releases: [] };
}

export function persistRadarRelease({ stateDir, release, at = new Date().toISOString() }) {
  if (!stateDir || !release?.slug) throw new TypeError('stateDir and release are required');
  const root = path.join(stateDir, 'releases');
  const releaseDir = path.join(root, release.slug);
  const indexFile = path.join(root, 'index.json');
  const receiptsFile = path.join(root, 'receipts.jsonl');
  const clipOutbox = path.join(stateDir, 'clip-outbox');
  const index = readJson(indexFile, releaseIndexDefault());

  if (index.releases.some((row) => row.release_id === release.release_id)) {
    return {
      schema: 'evercraft.systemia-radar.release-write.v1',
      status: 'deduped',
      release_id: release.release_id,
      slug: release.slug,
      public_path: `/radar/releases/${release.slug}/`
    };
  }

  const html = renderRadarReleaseHtml(release);
  const svg = renderRadarHeroSvg(release);
  atomicWrite(path.join(releaseDir, 'release.json'), release);
  atomicWrite(path.join(releaseDir, 'index.html'), html);
  atomicWrite(path.join(releaseDir, 'hero.svg'), svg);

  const clipPackage = {
    schema: 'evercraft.clip.radar-release.v1',
    release_id: release.release_id,
    source_edition_id: release.source_edition_id,
    brand: 'evercraft',
    canonical_path: `/radar/releases/${release.slug}/`,
    derivatives: release.derivatives,
    evidence_sha256: release.content_sha256,
    distribution_authority: 'evercraft_clip_only',
    external_action_taken: false,
    rule: 'This outbox item is ready for Evercraft Clip. Writing the outbox does not itself publish to an external platform.'
  };
  atomicWrite(path.join(clipOutbox, `${release.slug}.json`), clipPackage);

  const row = {
    release_id: release.release_id,
    slug: release.slug,
    title: release.title,
    generated_at: release.generated_at,
    verification_cutoff: release.verification_cutoff,
    source_edition_id: release.source_edition_id,
    content_sha256: release.content_sha256,
    public_path: `/radar/releases/${release.slug}/`
  };
  index.releases = [row, ...(index.releases || [])].slice(0, 250);
  index.updated_at = at;
  atomicWrite(indexFile, index);

  const receipt = {
    schema: 'evercraft.systemia-radar.release-receipt.v1',
    status: 'released_owned_archive',
    release_id: release.release_id,
    source_edition_id: release.source_edition_id,
    slug: release.slug,
    released_at: at,
    public_path: row.public_path,
    article_sha256: sha256(html),
    hero_sha256: sha256(svg),
    content_sha256: release.content_sha256,
    clip_outbox_written: true,
    external_social_publish_performed: false
  };
  appendJsonl(receiptsFile, receipt);
  return receipt;
}

export function listRadarReleases(stateDir) {
  return readJson(path.join(stateDir, 'releases', 'index.json'), releaseIndexDefault());
}

export function readRadarRelease(stateDir, slug) {
  const safe = clean(slug);
  if (!/^[a-z0-9-]+$/.test(safe)) return null;
  const file = path.join(stateDir, 'releases', safe, 'release.json');
  return fs.existsSync(file) ? readJson(file, null) : null;
}

export function readRadarReleaseAsset(stateDir, slug, asset) {
  const safe = clean(slug);
  if (!/^[a-z0-9-]+$/.test(safe)) return null;
  if (!['index.html', 'hero.svg'].includes(asset)) return null;
  const file = path.join(stateDir, 'releases', safe, asset);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function reconcileRadarCorrections({
  stateDir,
  radarState,
  currentEdition,
  at = new Date().toISOString()
} = {}) {
  const index = listRadarReleases(stateDir);
  const latestRow = index.releases?.[0];
  if (!latestRow) return { schema: 'evercraft.systemia-radar.correction-run.v1', status: 'no_release', corrections: [] };
  const release = readRadarRelease(stateDir, latestRow.slug);
  if (!release) return { schema: 'evercraft.systemia-radar.correction-run.v1', status: 'release_missing', corrections: [] };

  const existingFile = path.join(stateDir, 'corrections.jsonl');
  const existing = fs.existsSync(existingFile)
    ? fs.readFileSync(existingFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const existingKeys = new Set(existing.map((row) => row.correction_key));
  const rolloffMap = new Map((currentEdition?.change_wall || []).map((row) => [row.signal_id, row]));
  const corrections = [];

  for (const releasedSignal of release.signals || []) {
    const stream = Object.values(radarState?.streams || {}).find((row) => row.current?.signal_id === releasedSignal.signal_id);
    const current = stream?.current || null;
    const delta = rolloffMap.get(releasedSignal.signal_id);
    const changedObservation = current && current.observation_id !== releasedSignal.observation_id;
    const changedTruth = current && current.truth_state !== releasedSignal.truth_state;
    const correctionState = delta?.change_state === 'ROLLED_OFF' || delta?.change_state === 'CLOSED' || delta?.change_state === 'CONTESTED'
      ? delta.change_state
      : changedTruth
        ? current.truth_state
        : changedObservation
          ? 'UPDATED'
          : null;
    if (!correctionState) continue;

    const key = `${release.release_id}::${releasedSignal.signal_id}::${current?.observation_id || correctionState}`;
    if (existingKeys.has(key)) continue;
    const correction = {
      schema: 'evercraft.systemia-radar.correction.v1',
      correction_key: key,
      release_id: release.release_id,
      release_slug: release.slug,
      signal_id: releasedSignal.signal_id,
      previous_observation_id: releasedSignal.observation_id,
      current_observation_id: current?.observation_id || null,
      previous_truth_state: releasedSignal.truth_state,
      current_truth_state: current?.truth_state || releasedSignal.truth_state,
      change_state: correctionState,
      previous_summary: releasedSignal.summary,
      current_summary: current?.summary || null,
      detected_at: at,
      public_note_required: true
    };
    appendJsonl(existingFile, correction);
    corrections.push(correction);
    existingKeys.add(key);
  }

  return {
    schema: 'evercraft.systemia-radar.correction-run.v1',
    status: corrections.length ? 'corrections_detected' : 'clean',
    release_id: release.release_id,
    corrections
  };
}

export function listRadarCorrections(stateDir, { limit = 100 } = {}) {
  const file = path.join(stateDir, 'corrections.jsonl');
  if (!fs.existsSync(file)) {
    return { schema: 'evercraft.systemia-radar.corrections.v1', corrections: [] };
  }
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return {
    schema: 'evercraft.systemia-radar.corrections.v1',
    corrections: rows.slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse()
  };
}
