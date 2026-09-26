#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  PORTFOLIO_SENTINEL,
  buildPortfolioDelta,
  buildPortfolioMissionSnapshot,
  buildPortfolioRepairQueue,
  buildSentinelState,
  createPortfolioSentinelGoal,
  inspectLocalPortfolio,
  makeFinding
} from './portfolio-sentinel.mjs';
import {
  loadRepairRecipeRegistry,
  resolveRepairRecipe
} from '../sentinel/architectural-invariants.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv) {
  const out = {
    root: '.',
    outDir: 'artifacts/portfolio-sentinel',
    offline: false,
    maxUrls: 24,
    githubOwner: process.env.PORTFOLIO_SENTINEL_GITHUB_OWNER || 'jgaethle10',
    githubRepo: process.env.GITHUB_REPOSITORY || 'jgaethle10/forge-operator',
    autoHeal: process.env.PORTFOLIO_SENTINEL_AUTO_HEAL === 'true',
    enforceHealth: process.env.PORTFOLIO_SENTINEL_ENFORCE_HEALTH !== 'false'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--root') out.root = argv[++i];
    else if (value === '--out') out.outDir = argv[++i];
    else if (value === '--offline') out.offline = true;
    else if (value === '--max-urls') out.maxUrls = Math.max(1, Number(argv[++i] || 24));
    else if (value === '--github-owner') out.githubOwner = argv[++i];
    else if (value === '--github-repo') out.githubRepo = argv[++i];
    else if (value === '--auto-heal') out.autoHeal = true;
    else if (value === '--no-enforce-health') out.enforceHealth = false;
  }
  return out;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadHumanExperienceFindings(rootDir) {
  const relative = 'artifacts/human-experience/latest.json';
  const receipt = loadJson(path.join(rootDir, relative), null);
  if (!receipt || !Array.isArray(receipt.findings)) {
    return { receipt: null, findings: [] };
  }

  const severityMap = { P0: 'critical', P1: 'high', P2: 'medium', BLOCKED: 'medium' };
  const findings = receipt.findings.map((row) => makeFinding({
    code: `human_experience_${clean(row.code) || 'finding'}`,
    severity: severityMap[clean(row.severity).toUpperCase()] || 'medium',
    subject: clean(row.product_name || row.product_key || row.url || 'Evercraft public portfolio'),
    detail: clean(row.detail || 'Human-experience inspection produced a finding.'),
    evidence_refs: [
      `artifact:${relative}`,
      ...(row.url ? [`url:${row.url}`] : [])
    ],
    repair_mode: clean(row.severity).toUpperCase() === 'BLOCKED'
      ? 'verify_external_dependency'
      : 'systemia_repair',
    human_gate_required: false,
    metadata: {
      source: 'saban-human-experience',
      human_experience_severity: clean(row.severity).toUpperCase() || null,
      role: row.role || null,
      product_key: row.product_key || null,
      finding_code: row.code || null
    }
  }));

  return { receipt, findings };
}

function headers(token = '') {
  return {
    'user-agent': 'Evercraft-Systemia-Portfolio-Sentinel/1.0',
    'accept': 'application/vnd.github+json,text/html;q=0.9,application/json;q=0.9,*/*;q=0.1',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

async function probeUrl(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: headers(),
      signal: AbortSignal.timeout(9000)
    });
    const alive = response.status !== 404 && response.status !== 410 && response.status < 500;
    return {
      url,
      ok: alive,
      status: response.status,
      elapsed_ms: Date.now() - started,
      final_url: response.url || url,
      error: null
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      elapsed_ms: Date.now() - started,
      final_url: url,
      error: clean(error?.name || error?.message || error)
    };
  }
}

function rotateTargets(urls, maxUrls, now = new Date()) {
  const list = [...new Set((urls || []).filter((url) => /^https?:\/\//i.test(url)))].sort();
  if (list.length <= maxUrls) return list;
  const bucket = Math.floor(now.getTime() / (PORTFOLIO_SENTINEL.cadence_seconds * 1000));
  const offset = bucket % list.length;
  const out = [];
  for (let i = 0; i < Math.min(maxUrls, list.length); i += 1) out.push(list[(offset + i) % list.length]);
  return out;
}

async function scanPublicUrls(urls, maxUrls, now) {
  const targets = rotateTargets(urls, maxUrls, now);
  const rows = [];
  const findings = [];
  for (let i = 0; i < targets.length; i += 6) {
    const batch = await Promise.all(targets.slice(i, i + 6).map(probeUrl));
    rows.push(...batch);
  }
  for (const row of rows) {
    if (row.ok) continue;
    const severity = row.status != null && row.status >= 500 ? 'high' : 'medium';
    findings.push(makeFinding({
      code: row.status ? 'public_door_http_failure' : 'public_door_unreachable',
      severity,
      subject: row.url,
      detail: row.status ? `HTTP ${row.status} from public canonical door.` : `Network probe failed: ${row.error || 'unknown error'}.`,
      evidence_refs: [`url:${row.url}`],
      repair_mode: 'verify_external_dependency',
      human_gate_required: false,
      metadata: { status: row.status, final_url: row.final_url }
    }));
  }
  return { scanned: rows.length, rows, findings };
}

async function githubJson(url, token = '', method = 'GET') {
  const response = await fetch(url, {
    method,
    headers: headers(token),
    signal: AbortSignal.timeout(9000)
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch {}
  return { ok: response.ok, status: response.status, payload, text };
}

async function scanGithub({ owner, repository, token }) {
  const findings = [];
  const inventory = { owner, repositories: [], latest_workflows: [] };
  let scanned = 0;

  try {
    const repos = await githubJson(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&type=owner&sort=updated&direction=desc`, token);
    scanned += 1;
    if (repos.ok && Array.isArray(repos.payload)) {
      inventory.repositories = repos.payload.map((repo) => ({
        full_name: repo.full_name,
        archived: Boolean(repo.archived),
        disabled: Boolean(repo.disabled),
        default_branch: repo.default_branch,
        pushed_at: repo.pushed_at,
        homepage: repo.homepage || null,
        size: Number(repo.size || 0)
      }));
      for (const repo of inventory.repositories) {
        if (repo.disabled) {
          findings.push(makeFinding({
            code: 'github_repository_disabled',
            severity: 'high',
            subject: repo.full_name,
            detail: 'Repository is disabled on GitHub.',
            evidence_refs: [`github:${repo.full_name}`],
            repair_mode: 'human_review',
            human_gate_required: true
          }));
        }
      }
    } else {
      findings.push(makeFinding({
        code: 'github_inventory_unavailable',
        severity: 'medium',
        subject: owner,
        detail: `GitHub repository inventory returned HTTP ${repos.status}.`,
        evidence_refs: [`github-owner:${owner}`],
        repair_mode: 'verify_external_dependency'
      }));
    }
  } catch (error) {
    findings.push(makeFinding({
      code: 'github_inventory_unreachable',
      severity: 'medium',
      subject: owner,
      detail: clean(error?.message || error),
      evidence_refs: [`github-owner:${owner}`],
      repair_mode: 'verify_external_dependency'
    }));
  }

  if (repository) {
    try {
      const runs = await githubJson(`https://api.github.com/repos/${repository}/actions/runs?branch=main&per_page=100`, token);
      scanned += 1;
      if (runs.ok && Array.isArray(runs.payload?.workflow_runs)) {
        const latest = new Map();
        for (const run of runs.payload.workflow_runs) {
          const key = clean(run.name || run.workflow_id);
          if (!latest.has(key)) latest.set(key, run);
        }
        inventory.latest_workflows = [...latest.entries()].map(([name, run]) => ({
          id: run.id,
          name,
          conclusion: run.conclusion,
          status: run.status,
          html_url: run.html_url,
          run_number: run.run_number,
          updated_at: run.updated_at
        }));
        for (const row of inventory.latest_workflows) {
          if (!['failure', 'timed_out', 'startup_failure', 'action_required'].includes(clean(row.conclusion))) continue;
          findings.push(makeFinding({
            code: 'github_workflow_failed',
            severity: 'high',
            subject: `${repository} / ${row.name}`,
            detail: `Latest main-branch workflow conclusion is ${row.conclusion} (run #${row.run_number}).`,
            evidence_refs: [row.html_url ? `url:${row.html_url}` : `github:${repository}:actions`],
            repair_mode: 'rerun_or_fix_ci',
            metadata: {
              run_id: row.id,
              run_number: row.run_number,
              workflow_name: row.name
            }
          }));
        }
      }
    } catch (error) {
      findings.push(makeFinding({
        code: 'github_workflow_inventory_unreachable',
        severity: 'medium',
        subject: repository,
        detail: clean(error?.message || error),
        evidence_refs: [`github:${repository}:actions`],
        repair_mode: 'verify_external_dependency'
      }));
    }
  }

  return { scanned, findings, inventory };
}

async function rerunNewFailedWorkflows({ findings = [], repository, token = '' }) {
  const attempts = [];
  if (!repository || !token) return attempts;
  for (const finding of findings) {
    if (finding.code !== 'github_workflow_failed' || finding.human_gate_required) continue;
    const runId = Number(finding.metadata?.run_id || 0);
    const workflowName = clean(finding.metadata?.workflow_name);
    if (!runId || workflowName === 'Systemia Portfolio Sentinel') continue;
    const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}/rerun-failed-jobs`;
    try {
      const response = await githubJson(url, token, 'POST');
      attempts.push({
        run_id: runId,
        workflow_name: workflowName,
        accepted: response.ok,
        status: response.status
      });
    } catch (error) {
      attempts.push({
        run_id: runId,
        workflow_name: workflowName,
        accepted: false,
        status: null,
        error: clean(error?.message || error)
      });
    }
  }
  return attempts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(args.root);
  const outDir = path.resolve(args.outDir);
  const stateFile = path.join(outDir, 'state.json');
  const previous = loadJson(stateFile, { schema: 'evercraft.portfolio-sentinel.state.v1', active_findings: [] });
  const observedAt = new Date();

  const local = inspectLocalPortfolio({ rootDir });
  const humanExperience = loadHumanExperienceFindings(rootDir);
  const findings = [...local.findings, ...humanExperience.findings];
  const network = { url_probes: [], github: null };
  let scanned = local.scanned + Number(humanExperience.receipt?.summary?.surfaces || 0);

  if (!args.offline) {
    const publicScan = await scanPublicUrls(local.inventory.canonical_urls, args.maxUrls, observedAt);
    findings.push(...publicScan.findings);
    scanned += publicScan.scanned;
    network.url_probes = publicScan.rows;

    const githubScan = await scanGithub({
      owner: args.githubOwner,
      repository: args.githubRepo,
      token: process.env.GITHUB_TOKEN || ''
    });
    findings.push(...githubScan.findings);
    scanned += githubScan.scanned;
    network.github = githubScan.inventory;
  }

  const recipeRegistryResult = loadRepairRecipeRegistry(rootDir);
  if (!recipeRegistryResult.ok) {
    findings.push(makeFinding({
      code: 'repair_recipe_registry_invalid',
      severity: 'critical',
      subject: 'systemia/sentinel/repair-recipes.json',
      detail: recipeRegistryResult.reason,
      evidence_refs: ['repo:systemia/sentinel/repair-recipes.json'],
      repair_mode: 'systemia_repair',
      human_gate_required: true
    }));
  }

  const enrichedFindings = findings.map((finding) => {
    const recipe = recipeRegistryResult.ok
      ? resolveRepairRecipe(finding, recipeRegistryResult.registry)
      : null;
    return recipe ? { ...finding, repair_recipe: recipe } : finding;
  });

  const byKey = new Map();
  for (const row of enrichedFindings) byKey.set(row.finding_key, row);
  const activeFindings = [...byKey.values()].sort((a, b) =>
    ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) -
    ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity) ||
    a.finding_key.localeCompare(b.finding_key)
  );

  const delta = buildPortfolioDelta(previous, activeFindings);
  const retryCandidates = [...delta.added, ...delta.changed].filter((row) => row.code === 'github_workflow_failed');
  const autoHeal = {
    enabled: Boolean(args.autoHeal),
    workflow_reruns: args.autoHeal
      ? await rerunNewFailedWorkflows({
          findings: retryCandidates,
          repository: args.githubRepo,
          token: process.env.GITHUB_TOKEN || ''
        })
      : []
  };
  const repairQueue = buildPortfolioRepairQueue(activeFindings, delta);
  const evidenceRefs = activeFindings.flatMap((row) => row.evidence_refs || []).slice(0, 500);
  const snapshot = buildPortfolioMissionSnapshot({ scanned, delta, observedAt, evidenceRefs });
  const cycleKey = new Date(Math.floor(observedAt.getTime() / 300000) * 300000).toISOString();
  const admission = repairQueue.length
    ? createPortfolioSentinelGoal({ repairQueue, cycleKey, now: observedAt })
    : null;

  const severityCounts = activeFindings.reduce((acc, row) => {
    acc[row.severity] = (acc[row.severity] || 0) + 1;
    return acc;
  }, {});

  const report = {
    schema: 'evercraft.portfolio-sentinel.cycle.v1',
    workflow_key: PORTFOLIO_SENTINEL.workflow_key,
    mission_key: PORTFOLIO_SENTINEL.mission_key,
    cycle_key: cycleKey,
    observed_at: observedAt.toISOString(),
    cadence_seconds: PORTFOLIO_SENTINEL.cadence_seconds,
    mode: args.offline ? 'offline' : 'live',
    summary: {
      scanned,
      active_findings: activeFindings.length,
      severity_counts: severityCounts,
      added: delta.added.length,
      changed: delta.changed.length,
      persistent: delta.persistent.length,
      resolved: delta.resolved.length,
      repair_queue: repairQueue.length,
      blocking_findings: activeFindings.filter((row) => ['critical', 'high'].includes(row.severity)).length,
      matched_repair_recipes: activeFindings.filter((row) => row.repair_recipe?.recipe_id).length,
      human_experience_surfaces: Number(humanExperience.receipt?.summary?.surfaces || 0),
      human_experience_findings: Number(humanExperience.receipt?.summary?.findings || 0),
      human_experience_browser_blocked: humanExperience.receipt?.summary?.browser_visual_blocked ?? null
    },
    inventory: {
      ...local.inventory,
      github: network.github,
      human_experience: humanExperience.receipt?.summary || null
    },
    local_checks: local.checks,
    network,
    findings: activeFindings,
    delta: {
      added: delta.added,
      changed: delta.changed,
      resolved: delta.resolved
    },
    repair_queue: repairQueue,
    auto_heal: autoHeal,
    doctrine: {
      material_change_only: true,
      safe_internal_repairs_only: true,
      bounded_failed_workflow_retry: args.autoHeal ? 'autonomous' : 'disabled',
      architectural_invariants: 'enforced_before_green',
      repair_recipe_memory: recipeRegistryResult.ok ? 'loaded' : 'invalid',
      human_experience_gate: 'saban_static_evidence_plus_owned_browser_receipts',
      blocked_human_experience_never_counts_as_pass: true,
      production_mutation_requires_human_gate: true,
      payment_mutation_requires_human_gate: true,
      external_outreach_requires_human_gate: true
    }
  };

  atomicJson(path.join(outDir, 'latest.json'), report);
  atomicJson(path.join(outDir, 'mission-snapshot.json'), snapshot);
  atomicJson(path.join(outDir, 'repair-queue.json'), { schema: 'evercraft.portfolio-sentinel.repair-queue.v1', observed_at: report.observed_at, items: repairQueue });
  atomicJson(path.join(outDir, 'inventory.json'), { schema: 'evercraft.portfolio-sentinel.inventory.v1', observed_at: report.observed_at, ...report.inventory });
  atomicJson(path.join(outDir, 'repair-memory.json'), {
    schema: 'evercraft.portfolio-sentinel.repair-memory.v1',
    observed_at: report.observed_at,
    registry_version: recipeRegistryResult.ok ? recipeRegistryResult.registry?.version || null : null,
    registry_state: recipeRegistryResult.ok ? 'loaded' : 'invalid',
    matched: activeFindings
      .filter((row) => row.repair_recipe?.recipe_id)
      .map((row) => ({
        finding_key: row.finding_key,
        code: row.code,
        subject: row.subject,
        recipe: row.repair_recipe
      }))
  });
  atomicJson(path.join(outDir, 'admission.json'), admission || { schema: 'evercraft.portfolio-sentinel.admission.v1', admitted: false, reason: 'no_active_material_repairs', observed_at: report.observed_at });
  atomicJson(stateFile, buildSentinelState({ findings: activeFindings, observedAt }));

  const blockingFindings = activeFindings.filter((row) => ['critical', 'high'].includes(row.severity));
  const healthy = blockingFindings.length === 0;

  console.log(JSON.stringify({
    ok: healthy,
    cycle_key: cycleKey,
    scanned,
    active_findings: activeFindings.length,
    severity_counts: severityCounts,
    delta: { added: delta.added.length, changed: delta.changed.length, resolved: delta.resolved.length },
    repair_queue: repairQueue.length,
    blocking_findings: blockingFindings.length,
    auto_heal_reruns: autoHeal.workflow_reruns.length,
    matched_repair_recipes: activeFindings.filter((row) => row.repair_recipe?.recipe_id).length,
    mission_snapshot: path.join(outDir, 'mission-snapshot.json')
  }));

  if (!healthy && args.enforceHealth) process.exitCode = 1;
}

await main();
