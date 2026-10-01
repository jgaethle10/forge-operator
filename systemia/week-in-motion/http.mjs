import express from 'express';
import { listWeekInMotionRuns, readWeekInMotionRun, runWeekInMotionMachine } from './machine.mjs';
import { appendEvidenceEvent, readAllEvidenceEvents } from './ledger.mjs';

function requireAdmin(req, res, next) {
  const expected = String(process.env.WEEK_IN_MOTION_ADMIN_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ ok: false, error: 'Week in Motion admin token is not configured.' });
    return;
  }
  const supplied = String(req.headers.authorization || '');
  if (supplied !== `Bearer ${expected}`) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return;
  }
  next();
}

function requireIngest(req, res, next) {
  const expected = String(process.env.WEEK_IN_MOTION_INGEST_TOKEN || process.env.WEEK_IN_MOTION_ADMIN_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ ok: false, error: 'Week in Motion ingest token is not configured.' });
    return;
  }
  const supplied = String(req.headers.authorization || '');
  if (supplied !== `Bearer ${expected}`) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return;
  }
  next();
}

function publicRun(run) {
  return {
    id: run.id,
    status: run.status,
    window: run.window,
    evidence: run.evidence,
    editorial: run.editorial,
    gate: run.gate,
    publication: {
      status: run.publication?.status || 'not_attempted',
      article_url: run.publication?.data?.article_url || null,
      public_release_status: run.publication?.data?.public_release_status || null,
    },
  };
}

export function registerWeekInMotionRoutes(app) {
  const router = express.Router();

  router.get('/status', async (_req, res) => {
    const [runs, inbox] = await Promise.all([listWeekInMotionRuns(), readAllEvidenceEvents()]);
    const current = runs[0] || null;
    const latestEvidence = inbox.reduce((latest, item) => {
      const candidate = Date.parse(item?.receivedAt || item?.occurredAt || '');
      if (!Number.isFinite(candidate)) return latest;
      return !latest || candidate > latest.time ? { time: candidate, value: item?.receivedAt || item?.occurredAt } : latest;
    }, null);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      software: 'Evercraft Week in Motion',
      mode: 'resident_weekly_machine',
      current: current ? publicRun(current) : null,
      history_count: runs.length,
      inbox: {
        total: inbox.length,
        latest_received_at: latestEvidence?.value || null,
      },
      doctrine: {
        benchmark: 'Sep 14-20, 2026 Week in Motion',
        long_form_default: true,
        stacked_one_liners_forbidden: true,
        evidence_state_required: true,
        journal_release_requires_gate_pass: true,
        listen_along_required: true,
        visual_handoff: 'Fallen',
        social_handoff: 'Evercraft Clip',
      },
      resident_trigger: {
        cadence: 'weekly',
        week_boundary: 'Monday-Sunday',
        timezone: 'America/Los_Angeles',
      },
    });
  });

  router.post('/evidence', requireIngest, async (req, res) => {
    try {
      const result = await appendEvidenceEvent(req.body || {});
      res.status(result.status === 'accepted' ? 202 : 200).json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/evidence', requireAdmin, async (_req, res) => {
    const evidence = await readAllEvidenceEvents();
    res.json({ ok: true, evidence_count: evidence.length, evidence });
  });

  router.get('/history', requireAdmin, async (_req, res) => {
    const runs = await listWeekInMotionRuns();
    res.json({ ok: true, runs });
  });

  router.get('/runs/:runId', requireAdmin, async (req, res) => {
    const run = await readWeekInMotionRun(req.params.runId);
    if (!run) {
      res.status(404).json({ ok: false, error: 'Week in Motion run not found.' });
      return;
    }
    res.json({ ok: true, run });
  });

  router.post('/run', requireAdmin, async (req, res) => {
    try {
      const result = await runWeekInMotionMachine({
        publish: req.body?.publish === true,
        now: req.body?.now,
      });
      res.status(result.status === 'published' || result.status === 'ready' ? 200 : 409).json({ ok: result.status === 'published' || result.status === 'ready', result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.use('/api/week-in-motion', router);
}
