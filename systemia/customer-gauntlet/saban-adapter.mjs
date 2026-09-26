import fs from 'node:fs';
import { runLocalLennox } from './lennox-engine.mjs';

const personas = JSON.parse(
  fs.readFileSync('systemia/customer-gauntlet/personas.json', 'utf8')
);
const personaById = new Map(
  (personas.personas || []).map((persona) => [persona.id, persona])
);

export async function runAssignment({ assignment }) {
  const raw = assignment?.item?.raw || {};
  const offer = raw.offer || raw;
  const persona = personaById.get(assignment.role);
  if (!persona) {
    throw new Error('unknown_lennox_persona:' + String(assignment.role || ''));
  }
  if (!offer?.public_id) {
    throw new Error('lennox_offer_missing_public_id');
  }

  const local = await runLocalLennox({
    offer,
    persona,
    reviewUrl: raw.review_url || null,
    buyerUrl: raw.buyer_url || null,
    timeoutMs: Number(process.env.CUSTOMER_GAUNTLET_TIMEOUT_MS || 20000)
  });

  const findings = Array.isArray(local.findings) ? local.findings : [];
  return {
    status: findings.length ? 'finding' : 'clean',
    agent_id: assignment.agent_id,
    idempotency_key: assignment.idempotency_key || null,
    public_id: offer.public_id,
    offer_name: offer.name || offer.public_id,
    persona_id: persona.id,
    role: assignment.role,
    findings,
    local,
    boundaries: {
      owned_execution: true,
      no_live_charge: true,
      no_automatic_checkout: true,
      no_payment_state_inference: true,
      no_fulfillment_state_inference: true,
      no_external_messages: true
    }
  };
}

export async function reconcile({ results }) {
  const rows = Array.isArray(results) ? results : [];
  const findings = rows.flatMap((row) =>
    (row?.findings || []).map((finding) => ({
      public_id: row.public_id || null,
      persona_id: row.persona_id || null,
      ...finding
    }))
  );
  return {
    status: findings.some((f) => f.severity === 'P0' || f.severity === 'P1')
      ? 'repair_required'
      : findings.length
        ? 'observations_present'
        : 'clean',
    executed_customers: rows.length,
    p0: findings.filter((f) => f.severity === 'P0').length,
    p1: findings.filter((f) => f.severity === 'P1').length,
    p2: findings.filter((f) => f.severity === 'P2').length,
    findings: findings.slice(0, 500)
  };
}
