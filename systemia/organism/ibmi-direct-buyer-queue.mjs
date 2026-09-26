import fs from 'node:fs';
import path from 'node:path';

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const clamp = (v) => Math.max(0, Math.min(100, Number.isFinite(Number(v)) ? Number(v) : 0));

function keyFor(row) {
  return 'ibmi-direct:' + (clean(row.company || row.source_name || 'unknown')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,80) || 'unknown');
}

export function buildIBMiBuyerResearchQueue({ buyers = [], previous = [] } = {}) {
  const prior = new Map(previous.map((row) => [clean(row.prospect_key), row]));
  const current = new Map();

  for (const raw of buyers) {
    const key = keyFor(raw);
    const old = prior.get(key) || {};
    const score = clamp(raw.score);
    current.set(key, {
      schema: 'evercraft.ibmi.buyer-research-candidate.v1',
      prospect_key: key,
      company: clean(raw.company || raw.source_name) || null,
      source_ref: clean(raw.source_ref || raw.url) || null,
      source_key: clean(raw.source_key) || null,
      evidence_quality: clamp(raw.evidence_quality),
      fit_score: score,
      technology_use_state: clean(raw.technology_use_state) || 'not_established',
      release_state: clean(raw.release_state) || 'unknown',
      observed_release: clean(raw.observed_release) || null,
      buying_intent_state: 'unknown',
      budget_state: 'unknown',
      upgrade_need_state: clean(raw.upgrade_need_state) || 'unknown',
      recommended_offer_key: clean(raw.recommended_offer_key) || 'ibmi_estate_xray_250',
      queue_state: score >= 90 ? 'contact_research_priority' : score >= 75 ? 'contact_research' : 'hold',
      contact_state: old.contact_state || 'unverified',
      outreach_state: old.outreach_state || 'not_drafted',
      last_contact_research_at: old.last_contact_research_at || null,
      last_human_review_at: old.last_human_review_at || null,
      evidence_refs: [...new Set([
        ...(Array.isArray(old.evidence_refs) ? old.evidence_refs : []),
        clean(raw.source_ref || raw.url),
        raw.source_key ? 'source:' + clean(raw.source_key) : '',
      ].filter(Boolean))],
      human_review_required: true,
      automated_send_allowed: false,
      no_automated_followup: true,
      first_seen_at: old.first_seen_at || raw.observed_at || new Date().toISOString(),
      last_seen_at: raw.observed_at || new Date().toISOString(),
    });
  }

  for (const [key, old] of prior.entries()) {
    if (!current.has(key)) current.set(key, {
      ...old,
      queue_state: old.queue_state === 'hold' ? 'hold' : 'stale_reverify',
      stale_reason: 'not_present_in_latest_buyer_signal_feed',
    });
  }

  const prospects = [...current.values()].sort((a,b) =>
    Number(b.fit_score || 0) - Number(a.fit_score || 0) ||
    String(a.company || '').localeCompare(String(b.company || ''))
  );

  return {
    schema: 'evercraft.ibmi.buyer-research-queue.v1',
    generated_at: new Date().toISOString(),
    count: prospects.length,
    priority_count: prospects.filter((r) => r.queue_state === 'contact_research_priority').length,
    research_count: prospects.filter((r) => r.queue_state === 'contact_research').length,
    stale_count: prospects.filter((r) => r.queue_state === 'stale_reverify').length,
    doctrine: {
      research_queue_is_not_buying_intent: true,
      no_unsolicited_automated_outreach: true,
      contact_must_be_verified_before_named_draft: true,
      human_review_before_send: true,
      payment_requires_explicit_human_confirmation: true,
    },
    prospects,
  };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const buyerFile = value('--buyers', 'artifacts/legacy-rescue-watch/buyer-signals.json');
  const outFile = value('--out', 'artifacts/legacy-rescue-watch/buyer-research-queue.json');
  const previous = readJson(outFile, { prospects: [] });
  const feed = readJson(buyerFile, { buyers: [] });
  const result = buildIBMiBuyerResearchQueue({
    buyers: Array.isArray(feed) ? feed : feed.buyers || [],
    previous: previous.prospects || [],
  });
  atomicJson(outFile, result);
  console.log(JSON.stringify({ ok:true, count:result.count, priority_count:result.priority_count, research_count:result.research_count, stale_count:result.stale_count, out:outFile }));
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
