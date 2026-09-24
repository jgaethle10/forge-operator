import crypto from 'node:crypto';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('./policy.json', import.meta.url), 'utf8'));

const norm = (v) => String(v ?? '').trim().toLowerCase();

export function fingerprint(signal) {
  const stable = [
    signal.company || 'evercraft',
    signal.product || signal.service || 'unknown',
    signal.source || 'unknown',
    signal.kind || 'unknown',
    signal.component || signal.workflow || 'unknown',
    signal.error_code || signal.condition || signal.status || 'unknown'
  ].map(norm).join('|');
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0,24);
}

export function classify(signal) {
  const status = norm(signal.status);
  const conclusion = norm(signal.conclusion);
  const evidence = norm(signal.evidence_state || signal.doorway_state);
  const impact = norm(signal.impact);
  const kind = norm(signal.kind);
  const source = norm(signal.source);
  const humanAction = Boolean(signal.human_action_required);

  if (['cancelled','canceled','skipped','success','successful','passed','pass'].includes(conclusion) ||
      ['cancelled','canceled','skipped','success','healthy','recovered'].includes(status)) {
    return 'receipt';
  }

  if (
    signal.security_incident === true ||
    signal.data_loss === true ||
    signal.compliance_deadline_imminent === true ||
    impact === 'customer_live' ||
    impact === 'production_outage' ||
    (humanAction && ['payment_blocked','legal_gate','trust_gate','production_outage'].includes(kind))
  ) return 'critical';

  if (
    evidence === 'live_verified' &&
    ['failure','failed','down','unhealthy','degraded'].includes(status || conclusion)
  ) return 'critical';

  if (
    source === 'main' ||
    signal.mainline === true ||
    signal.release_blocked === true ||
    signal.repeat_count >= 3
  ) return 'warning';

  return 'notice';
}

export function route(signal) {
  const severity = classify(signal);
  const fp = fingerprint(signal);
  const routes = policy.routes[severity] || ['ledger'];
  return {
    schema:'systemia.signal.v1',
    id: signal.id || fp,
    fingerprint: fp,
    company: signal.company || 'Evercraft',
    product: signal.product || signal.service || 'unknown',
    source: signal.source || 'unknown',
    severity,
    evidence_state: signal.evidence_state || signal.doorway_state || 'unknown',
    human_action_required:Boolean(signal.human_action_required),
    summary: signal.summary || signal.message || '',
    routes,
    dedupe_window_seconds: policy.defaults.dedupe_window_seconds,
    immediate_allowed: severity === 'critical',
    digest_eligible: severity === 'notice' || severity === 'warning',
    created_at: signal.created_at || new Date().toISOString()
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chunks=[];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    console.error('Expected one JSON signal on stdin');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(route(JSON.parse(raw)), null, 2)+'\n');
}
