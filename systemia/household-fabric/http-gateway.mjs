import fs from 'node:fs';
import path from 'node:path';

function clean(value) {
  return String(value ?? '').trim();
}

function safeOpportunity(row) {
  return {
    id: clean(row?.id),
    title: clean(row?.title),
    category: clean(row?.category),
    value_basis: clean(row?.value_basis),
    net_value_cents: Number(row?.net_value_cents ?? 0),
    confidence: Number(row?.confidence ?? 0),
    evidence_label: clean(row?.evidence_label),
    requires_eligibility_check: Boolean(row?.requires_eligibility_check),
    observed_at: clean(row?.observed_at) || null,
    expires_at: clean(row?.expires_at) || null,
    source_name: clean(row?.source_name) || null,
    source_url: clean(row?.source_url) || null,
    location: row?.location && typeof row.location === 'object' ? row.location : null,
    actions: Array.isArray(row?.actions) ? row.actions.map(action => ({
      type: clean(action?.type),
      label: clean(action?.label),
      url: clean(action?.url) || null,
    })) : [],
    sponsored: Boolean(row?.sponsored),
    sponsor_label: clean(row?.sponsor_label) || null,
  };
}

export function publicHouseholdTodayProjection(today) {
  if (!today || today.schema !== 'systemia.household-fabric.surface.v1') {
    throw new Error('invalid_household_fabric_today_artifact');
  }

  return {
    ok: true,
    schema: 'evercraft.household-fabric.public-today.v1',
    generated_at: clean(today.generated_at),
    geography: clean(today.geography),
    mode: clean(today.mode),
    status: clean(today.status),
    coverage: {
      healthy: Boolean(today.coverage?.healthy),
      degraded_categories: Array.isArray(today.coverage?.degraded_categories)
        ? today.coverage.degraded_categories.map(clean).filter(Boolean)
        : [],
      conflicts_open: Number(today.coverage?.conflicts_open ?? 0),
    },
    headline: {
      money_kept_cents: Number(today.headline?.money_kept_cents ?? 0),
      money_earned_cents: Number(today.headline?.money_earned_cents ?? 0),
      opportunities_shown: Number(today.headline?.opportunities_shown ?? 0),
    },
    opportunities: Array.isArray(today.opportunities)
      ? today.opportunities.map(safeOpportunity)
      : [],
    message: clean(today.message),
    guardrails: {
      sponsorship_affects_rank: Boolean(today.guardrails?.sponsorship_affects_rank),
      poverty_score_used: Boolean(today.guardrails?.poverty_score_used),
      personal_data_sale_required: Boolean(today.guardrails?.personal_data_sale_required),
      stale_money_claims_allowed: Boolean(today.guardrails?.stale_money_claims_allowed),
    },
  };
}

export function readHouseholdTodayArtifact(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function registerHouseholdFabricGateway(app, {
  artifactPath = process.env.HOUSEHOLD_FABRIC_YAKIMA_TODAY_PATH ||
    path.resolve('artifacts/household-fabric/yakima/today.json'),
} = {}) {
  app.get('/api/household-fabric/health', (_req, res) => {
    const artifact = readHouseholdTodayArtifact(artifactPath);
    let valid = false;
    try {
      if (artifact) {
        publicHouseholdTodayProjection(artifact);
        valid = true;
      }
    } catch {}

    res.setHeader('cache-control', 'no-store');
    res.json({
      ok: true,
      service: 'evercraft-household-fabric-gateway',
      geography: 'yakima-wa',
      artifact_available: Boolean(artifact),
      artifact_valid: valid,
      state: valid ? 'ready' : 'awaiting_today_artifact',
    });
  });

  app.get('/api/household-fabric/yakima/today', (_req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    const artifact = readHouseholdTodayArtifact(artifactPath);

    if (!artifact) {
      res.setHeader('cache-control', 'no-store');
      res.status(503).json({
        ok: false,
        schema: 'evercraft.household-fabric.public-unavailable.v1',
        geography: 'yakima-wa',
        error: 'household_fabric_today_unavailable',
        message: 'Fresh Yakima household intelligence is not available yet. Missing data is not filled with guesses.',
      });
      return;
    }

    try {
      const payload = publicHouseholdTodayProjection(artifact);
      res.setHeader('cache-control', 'public, max-age=60, must-revalidate');
      res.json(payload);
    } catch {
      res.setHeader('cache-control', 'no-store');
      res.status(503).json({
        ok: false,
        schema: 'evercraft.household-fabric.public-unavailable.v1',
        geography: 'yakima-wa',
        error: 'household_fabric_today_invalid',
        message: 'The latest household intelligence artifact failed validation and will not be served.',
      });
    }
  });
}
