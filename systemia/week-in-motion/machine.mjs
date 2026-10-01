import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectGitHubEvidence,
  generateEditorial,
  publicationPayload,
  publishJournal,
  qualityGate,
  resolveCompletedWeek,
  summarizeEvidence,
  writeArtifacts,
} from './engine.mjs';

function safeDate(value) {
  if (!value) return new Date();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export async function runWeekInMotionMachine(options = {}) {
  const repo = options.repo || process.env.GITHUB_REPOSITORY || process.env.EVERCRAFT_REPOSITORY || 'jgaethle10/forge-operator';
  const token = options.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  const now = safeDate(options.now);
  const window = resolveCompletedWeek(now);
  const outDir = options.outDir || process.env.WEEK_IN_MOTION_STATE_DIR || 'artifacts/week-in-motion';
  const shouldPublish = options.publish === true;

  const evidence = await collectGitHubEvidence({ repo, token, window });
  const summary = summarizeEvidence(evidence);

  let editorial = { status: 'blocked_no_evidence', reason: 'No evidence was collected.' };
  let gate = { pass: false, reasons: ['blocked_no_evidence'], metrics: {} };
  let payload = null;
  let publication = { status: 'not_attempted' };

  if (evidence.length) {
    editorial = await generateEditorial({
      window,
      evidence,
      endpoint: options.editorialEndpoint ?? process.env.EVERCRAFT_EDITORIAL_ENDPOINT,
      token: options.editorialToken ?? process.env.EVERCRAFT_EDITORIAL_TOKEN,
      model: options.editorialModel ?? process.env.EVERCRAFT_EDITORIAL_MODEL,
    });

    if (editorial.status === 'generated') {
      gate = qualityGate({ output: editorial.output, evidence, window });
      payload = publicationPayload({ output: editorial.output, evidence, window, gate });

      if (shouldPublish && gate.pass) {
        publication = await publishJournal({
          payload,
          ingressUrl: options.journalIngressUrl ?? process.env.SYSTEMIA_JOURNAL_INGRESS_URL,
          secret: options.journalSecret ?? process.env.SYSTEMIA_JOURNAL_SHARED_SECRET,
        });
      } else if (shouldPublish) {
        publication = { status: 'blocked_quality_gate', reasons: gate.reasons };
      }
    } else {
      gate = { pass: false, reasons: [editorial.reason || editorial.status], metrics: {} };
    }
  }

  const artifactDir = await writeArtifacts({
    outDir,
    window,
    evidence,
    editorial,
    gate,
    publication,
    publishPayload: payload,
  });

  const result = {
    schema: 'evercraft.week-in-motion.run.v1',
    id: window.key,
    startedAt: new Date().toISOString(),
    status: publication.status === 'published'
      ? 'published'
      : gate.pass
        ? 'ready'
        : editorial.status === 'generated'
          ? 'blocked_quality'
          : 'blocked',
    window: {
      start: window.startDate,
      end: window.endDate,
      slug: window.slug,
      timezone: window.timezone,
    },
    evidence: summary,
    editorial: {
      status: editorial.status,
      thesis: editorial?.output?.visual_brief?.thesis || editorial?.output?.subtitle || null,
      title: editorial?.output?.title || null,
      excerpt: editorial?.output?.excerpt || null,
    },
    gate,
    publication,
    artifactDir,
  };

  await fs.writeFile(path.join(artifactDir, 'run.json'), JSON.stringify(result, null, 2));
  return result;
}

export async function listWeekInMotionRuns(outDir = process.env.WEEK_IN_MOTION_STATE_DIR || 'artifacts/week-in-motion') {
  let names = [];
  try { names = await fs.readdir(outDir); } catch { return []; }
  const rows = [];
  for (const name of names.sort().reverse()) {
    try {
      const raw = await fs.readFile(path.join(outDir, name, 'run.json'), 'utf8');
      rows.push(JSON.parse(raw));
    } catch {}
  }
  return rows;
}

export async function readWeekInMotionRun(runId, outDir = process.env.WEEK_IN_MOTION_STATE_DIR || 'artifacts/week-in-motion') {
  const safe = String(runId || '').replace(/[^0-9-]/g, '');
  const dir = path.join(outDir, safe);
  const files = {};
  for (const name of ['run.json','evidence-ledger.json','editorial.json','quality-gate.json','publication-result.json','social.txt','listen-comment.txt','fallen-visual-brief.json']) {
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      files[name] = name.endsWith('.json') ? JSON.parse(raw) : raw;
    } catch {}
  }
  return Object.keys(files).length ? files : null;
}
