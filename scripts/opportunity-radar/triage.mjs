// Evidence-first, offline opportunity triage. Input: JSON array of manually sourced notices.
// This module does not crawl, contact, apply, or infer eligibility from a grant title.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const FIELDS = ['technical_fit', 'demonstrated_readiness', 'deadline_feasibility', 'potential_value', 'mission_fit'];
const HOLD_TERMS = /\b(?:RIVET|AliEV)\b/i;

export function triage(notices, { checkedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(notices)) throw new TypeError('Expected an array of notice records');
  if (!Number.isFinite(Date.parse(checkedAt))) throw new TypeError('checkedAt must be an ISO date');
  const seen = new Set();
  const output = [];
  for (const raw of notices) {
    if (!raw || typeof raw !== 'object') throw new TypeError('Each notice must be an object');
    const source = new URL(raw.source_url);
    if (!['https:', 'http:'].includes(source.protocol)) throw new Error('Source must be HTTP(S)');
    if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Missing notice title');
    const key = [String(raw.publisher || '').trim().toLowerCase(), String(raw.notice_id || '').trim().toLowerCase(), source.href].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const eligibility = ['eligible', 'ineligible', 'unknown'].includes(raw.eligibility) ? raw.eligibility : 'unknown';
    const status = ['verified_open', 'closed', 'unknown'].includes(raw.status) ? raw.status : 'unknown';
    const scores = {};
    for (const field of FIELDS) {
      const value = raw.scores?.[field];
      scores[field] = Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
    }
    const scoreComplete = Object.values(scores).every(v => v !== null);
    const held = HOLD_TERMS.test([raw.title, ...(raw.candidate_capabilities || [])].join(' '));
    const deadlineValid = !raw.deadline_at || Number.isFinite(Date.parse(raw.deadline_at));
    if (!deadlineValid) throw new Error('Invalid deadline_at');
    const expired = !!raw.deadline_at && Date.parse(raw.deadline_at) < Date.parse(checkedAt);
    const hardStop = eligibility === 'ineligible' || status === 'closed' || expired || held;
    output.push({
      source_url: source.href, publisher: raw.publisher || null, notice_id: raw.notice_id || null,
      title: raw.title.trim(), last_checked_at: checkedAt, deadline_at: raw.deadline_at || null,
      eligibility, status, candidate_capabilities: raw.candidate_capabilities || [],
      scores, score: scoreComplete ? Object.values(scores).reduce((a,b)=>a+b,0) : null,
      held, expired, hard_stop: hardStop,
      review_state: hardStop ? 'blocked' : eligibility !== 'eligible' || status !== 'verified_open' || !scoreComplete ? 'verify_before_action' : 'owner_review_required',
      no_contact_without_approval: true,
      evidence_links: Array.isArray(raw.evidence_links) ? raw.evidence_links : [],
    });
  }
  return output.sort((a,b) => Number(a.hard_stop)-Number(b.hard_stop) || (b.score ?? -1)-(a.score ?? -1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node scripts/opportunity-radar/triage.mjs notices.json'); process.exitCode = 2; }
  else {
    try { console.log(JSON.stringify(triage(JSON.parse(await readFile(path,'utf8'))), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
