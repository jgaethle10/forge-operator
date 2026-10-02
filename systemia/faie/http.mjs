import path from 'node:path';
import { createFaieRuntime, investigationToMarkdown } from './runtime.mjs';
import { executeFaieMcpRpc, faieMcpTools } from './mcp.mjs';

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function publicRefs(refs = []) {
  return (Array.isArray(refs) ? refs : []).filter((ref) => /^https?:\/\//i.test(String(ref || '')));
}

function publicInvestigation(investigation) {
  if (!investigation) return null;
  return {
    ...structuredClone(investigation),
    findings: (investigation.findings || []).map((finding) => ({
      ...structuredClone(finding),
      provenance_ref_count: Array.isArray(finding.provenance_refs) ? finding.provenance_refs.length : 0,
      provenance_refs: publicRefs(finding.provenance_refs)
    })),
    evidence_ledger: (investigation.evidence_ledger || []).map((row) => ({
      ...structuredClone(row),
      provenance_ref_count: Array.isArray(row.provenance_refs) ? row.provenance_refs.length : 0,
      provenance_refs: publicRefs(row.provenance_refs)
    }))
  };
}

export function registerFaieRoutes(app, {
  isProd = process.env.NODE_ENV === 'production',
  stateDir = process.env.FAIE_STATE_DIR || path.resolve('.runtime', 'faie'),
  intervalMs = Number(process.env.FAIE_INTERVAL_MS || 5 * 60 * 1000),
  radarResident = null,
  fetchImpl = globalThis.fetch,
  collectorConfig = undefined,
  internalToken = process.env.FAIE_INTERNAL_TOKEN || '',
  publicInvestigateLimiter = (_req, _res, next) => next()
} = {}) {
  const token = String(internalToken || '').trim();
  const runtime = createFaieRuntime({
    stateDir,
    intervalMs,
    radarResident,
    fetchImpl,
    collectorConfig
  });

  function requireInternal(req, res, next) {
    if (!token) {
      res.status(503).json({
        ok: false,
        error: 'FAIE internal write authority is not configured.'
      });
      return;
    }
    if (bearer(req) !== token) {
      res.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }
    next();
  }

  app.get('/api/faie/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(runtime.health());
  });

  app.get('/api/faie/signals', (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit) || 50));
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.json(runtime.snapshot(limit));
  });

  app.get('/api/faie/investigations', requireInternal, (req, res) => {
    const limit = Math.max(1, Math.min(50, Number(req.query?.limit) || 10));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      schema: 'evercraft.faie.investigation-index.public.v1',
      investigations: runtime.latestInvestigations(limit).map(publicInvestigation)
    });
  });

  app.get('/api/faie/investigations/:id', requireInternal, (req, res) => {
    const investigation = runtime.getInvestigation(String(req.params.id || ''));
    if (!investigation) {
      res.status(404).json({ ok: false, error: 'FAIE investigation not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(publicInvestigation(investigation));
  });

  app.get('/api/faie/investigations/:id/markdown', requireInternal, (req, res) => {
    const investigation = runtime.getInvestigation(String(req.params.id || ''));
    if (!investigation) {
      res.status(404).type('text/plain').send('FAIE investigation not found.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/markdown').send(investigationToMarkdown(publicInvestigation(investigation)));
  });

  app.get('/mcp/faie', (req, res) => {
    if (String(req.query?.action || '') !== 'health') {
      res.status(405).json({
        ok: false,
        error: 'Use MCP Streamable HTTP POST or ?action=health.'
      });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'FAIE',
      server: 'evercraft-faie',
      version: '1.0.0',
      transport: 'Streamable HTTP',
      tools: faieMcpTools().map((tool) => tool.name),
      runtime: 'Evercraft Forge / Systemia',
      persisted_public_investigations: false,
      checkout_enabled: false,
      payment_enabled: false,
      decision_authority: false,
      publication_authority: false
    });
  });

  app.post('/mcp/faie', publicInvestigateLimiter, async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const response = await executeFaieMcpRpc(runtime, req.body);
      if (response === null) {
        res.status(202).end();
        return;
      }
      res.type('application/json').json(response);
    } catch (error) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  app.post('/api/faie/investigate', publicInvestigateLimiter, (req, res) => {
    try {
      const question = String(req.body?.question || req.body?.query || '').trim();
      if (!question) {
        res.status(400).json({ ok: false, error: 'question is required.' });
        return;
      }
      if (question.length > 1200) {
        res.status(413).json({ ok: false, error: 'question is too long.' });
        return;
      }

      const investigation = runtime.preview({
        question,
        region_keys: req.body?.region_keys || req.body?.regions || req.body?.region,
        asset_types: req.body?.asset_types || req.body?.assets,
        crop: req.body?.crop,
        water_source: req.body?.water_source,
        horizon_days: req.body?.horizon_days,
        include_weak_evidence: req.body?.include_weak_evidence
      });

      res.status(200).json(publicInvestigation(investigation));
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/faie/investigations', requireInternal, (req, res) => {
    try {
      const question = String(req.body?.question || req.body?.query || '').trim();
      if (!question) {
        res.status(400).json({ ok: false, error: 'question is required.' });
        return;
      }
      if (question.length > 1200) {
        res.status(413).json({ ok: false, error: 'question is too long.' });
        return;
      }
      const investigation = runtime.investigate({
        question,
        region_keys: req.body?.region_keys || req.body?.regions || req.body?.region,
        asset_types: req.body?.asset_types || req.body?.assets,
        crop: req.body?.crop,
        water_source: req.body?.water_source,
        horizon_days: req.body?.horizon_days,
        include_weak_evidence: req.body?.include_weak_evidence
      });
      res.status(201).json(publicInvestigation(investigation));
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app.post('/api/faie/ingest', requireInternal, (req, res) => {
    try {
      const decision = runtime.ingest(req.body?.observation || req.body);
      res.status(decision.action === 'ignored' ? 202 : 200).json({
        ok: true,
        decision
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/faie/worldstate-dispatch', requireInternal, (req, res) => {
    try {
      if (req.body?.dispatch?.consumer !== 'faie') {
        res.status(202).json({
          ok: true,
          decision: {
            action: 'ignored',
            reason: 'not_faie_consumer'
          }
        });
        return;
      }
      const decision = runtime.ingest(req.body?.observation);
      res.status(decision.action === 'ignored' ? 202 : 200).json({
        ok: true,
        dispatch_key: req.body?.dispatch?.dispatch_key || null,
        decision
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/faie/run', requireInternal, async (req, res) => {
    const receipt = await runtime.runOnce({
      externalObservations: Array.isArray(req.body?.observations) ? req.body.observations : []
    });
    res.status(receipt.status === 'partial' ? 207 : 200).json(receipt);
  });

  const autoStart = process.env.FAIE_RESIDENT_ENABLED == null
    ? isProd
    : String(process.env.FAIE_RESIDENT_ENABLED).toLowerCase() === 'true';

  if (autoStart) runtime.start();

  return runtime;
}
