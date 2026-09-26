import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { admitGoalPlan, createGoalState } from './goal-runtime.mjs';
import { evaluateArchitecturalInvariants } from '../sentinel/architectural-invariants.mjs';

export const PORTFOLIO_SENTINEL = Object.freeze({
  schema: 'evercraft.systemia.workflow.v1',
  workflow_key: 'portfolio-sentinel',
  mission_key: 'evercraft-portfolio-integrity-2026-09-25',
  cadence_seconds: 300,
  objective: 'Continuously inventory and verify Evercraft products, software, repositories, workflows, discovery surfaces, public doors, and resident services, then route material drift into bounded repair work.',
  success_condition: 'Every known portfolio surface is represented in a current truth map, material failures are deduplicated, repairable drift is admitted into Systemia, and risky mutations remain human-gated.',
  authority: {
    read_public_surfaces: 'autonomous',
    read_repository_state: 'autonomous',
    local_integrity_checks: 'autonomous',
    generate_repair_queue: 'autonomous',
    safe_internal_repair: 'bounded_allowlist_only',
    production_mutation: 'human_gate',
    payment_mutation: 'human_gate',
    external_outreach: 'human_gate'
  }
});

const MATERIAL = new Set(['critical', 'high', 'medium']);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function unique(values, limit = 500) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

export function makeFinding({
  code,
  severity = 'medium',
  subject,
  detail,
  evidence_refs = [],
  repair_mode = 'systemia_repair',
  repair_command = '',
  human_gate_required = false,
  metadata = {}
}) {
  const normalizedCode = clean(code).toLowerCase();
  const normalizedSubject = clean(subject);
  const normalizedSeverity = clean(severity).toLowerCase();
  const findingKey = `sentinel:${sha(`${normalizedCode}|${normalizedSubject.toLowerCase()}`).slice(0, 24)}`;
  const signature = sha(JSON.stringify({
    code: normalizedCode,
    severity: normalizedSeverity,
    subject: normalizedSubject,
    detail: clean(detail),
    repair_mode: clean(repair_mode),
    repair_command: clean(repair_command),
    human_gate_required: Boolean(human_gate_required),
    metadata
  }));
  return {
    schema: 'evercraft.portfolio-sentinel.finding.v1',
    finding_key: findingKey,
    signature,
    code: normalizedCode,
    severity: normalizedSeverity,
    subject: normalizedSubject,
    detail: clean(detail),
    evidence_refs: unique(evidence_refs),
    repair_mode: clean(repair_mode) || 'systemia_repair',
    repair_command: clean(repair_command),
    human_gate_required: Boolean(human_gate_required),
    metadata
  };
}

function exists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function safeJson(rootDir, relativePath) {
  const full = path.join(rootDir, relativePath);
  if (!fs.existsSync(full)) return { ok: false, reason: 'missing', value: null };
  try {
    return { ok: true, reason: null, value: JSON.parse(fs.readFileSync(full, 'utf8')) };
  } catch (error) {
    return { ok: false, reason: `invalid_json:${clean(error?.message || error)}`, value: null };
  }
}

function listDirNames(rootDir, relativePath) {
  const full = path.join(rootDir, relativePath);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFiles(rootDir, relativePath, suffix = '') {
  const full = path.join(rootDir, relativePath);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
    .map((entry) => path.posix.join(relativePath.replaceAll('\\', '/'), entry.name))
    .sort();
}

function scriptFileTargets(script) {
  const out = [];
  const re = /(?:^|&&|\|\||;)\s*(?:node|tsx)\s+([A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts|tsx))/g;
  for (const match of String(script || '').matchAll(re)) out.push(match[1]);
  return unique(out);
}

function workflowReferences(text) {
  const npmScripts = [];
  const files = [];
  for (const match of String(text || '').matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) npmScripts.push(match[1]);
  for (const match of String(text || '').matchAll(/\b(?:node|tsx)\s+([A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts|tsx))/g)) files.push(match[1]);
  return { npmScripts: unique(npmScripts), files: unique(files) };
}

function addFinding(report, finding) {
  report.findings.push(finding);
}

function addCheck(report, key, ok, detail = '', evidence_refs = []) {
  report.checks.push({
    check_key: clean(key),
    ok: Boolean(ok),
    detail: clean(detail),
    evidence_refs: unique(evidence_refs)
  });
}

export function inspectLocalPortfolio({ rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const report = {
    schema: 'evercraft.portfolio-sentinel.local-scan.v1',
    root_ref: 'repo-root',
    checks: [],
    findings: [],
    inventory: {
      products: [],
      registry_entries: [],
      workflows: [],
      resident_services: [],
      package_scripts: [],
      canonical_urls: [],
      architectural_invariants: []
    }
  };

  const requiredSurfaces = [
    'README.md',
    'AI-DISCOVERY.md',
    'llms-full.txt',
    'public/.well-known/evercraft-products.json',
    'public/.well-known/evercraft-capabilities.json',
    'public/chum/index.json'
  ];
  for (const surface of requiredSurfaces) {
    const ok = exists(root, surface);
    addCheck(report, `surface:${surface}`, ok, ok ? 'present' : 'missing', [`repo:${surface}`]);
    if (!ok) {
      addFinding(report, makeFinding({
        code: 'machine_surface_missing',
        severity: 'high',
        subject: surface,
        detail: 'Required machine-discovery or portfolio surface is missing.',
        evidence_refs: [`repo:${surface}`],
        repair_mode: 'bounded_generator',
        repair_command: surface.startsWith('public/chum/') ? 'npm run chum:mirror' : 'npm run chum:sync'
      }));
    }
  }

  const directoryResult = safeJson(root, 'public/.well-known/evercraft-products.json');
  if (!directoryResult.ok) {
    addFinding(report, makeFinding({
      code: 'product_directory_invalid',
      severity: 'critical',
      subject: 'public/.well-known/evercraft-products.json',
      detail: directoryResult.reason,
      evidence_refs: ['repo:public/.well-known/evercraft-products.json'],
      repair_mode: 'systemia_repair'
    }));
  } else {
    const products = Array.isArray(directoryResult.value?.products) ? directoryResult.value.products : [];
    const seen = new Map();
    report.inventory.products = products.map((product) => ({
      product_key: clean(product?.product_key),
      name: clean(product?.name),
      canonical_url: clean(product?.canonical_url),
      class: clean(product?.class)
    }));
    report.inventory.canonical_urls = unique(products.map((product) => product?.canonical_url));

    for (const product of report.inventory.products) {
      const key = product.product_key;
      if (!key) {
        addFinding(report, makeFinding({
          code: 'product_key_missing',
          severity: 'high',
          subject: product.name || '<unnamed product>',
          detail: 'Product directory record has no product_key.',
          evidence_refs: ['repo:public/.well-known/evercraft-products.json']
        }));
        continue;
      }
      if (seen.has(key)) {
        addFinding(report, makeFinding({
          code: 'duplicate_product_key',
          severity: 'critical',
          subject: key,
          detail: `Duplicate product_key appears for ${seen.get(key)} and ${product.name || '<unnamed>'}.`,
          evidence_refs: ['repo:public/.well-known/evercraft-products.json']
        }));
      } else {
        seen.set(key, product.name || key);
      }
      if (!product.name) {
        addFinding(report, makeFinding({
          code: 'product_name_missing',
          severity: 'medium',
          subject: key,
          detail: 'Public product record has no human-readable name.',
          evidence_refs: ['repo:public/.well-known/evercraft-products.json']
        }));
      }
      if (!product.canonical_url) {
        addFinding(report, makeFinding({
          code: 'canonical_url_missing',
          severity: 'medium',
          subject: key,
          detail: 'Public product record has no canonical_url.',
          evidence_refs: ['repo:public/.well-known/evercraft-products.json'],
          human_gate_required: true,
          repair_mode: 'human_review'
        }));
      } else if (!/^https?:\/\//i.test(product.canonical_url)) {
        addFinding(report, makeFinding({
          code: 'canonical_url_invalid',
          severity: 'high',
          subject: key,
          detail: `canonical_url is not HTTP(S): ${product.canonical_url}`,
          evidence_refs: ['repo:public/.well-known/evercraft-products.json'],
          human_gate_required: true,
          repair_mode: 'human_review'
        }));
      }
    }
    addCheck(report, 'product-directory-unique-keys',
      !report.findings.some((x) => x.code === 'duplicate_product_key'),
      `${products.length} product records inspected`,
      ['repo:public/.well-known/evercraft-products.json']);
  }

  report.inventory.registry_entries = listDirNames(root, 'registry');
  report.inventory.workflows = listFiles(root, '.github/workflows', '.yml');

  const packageResult = safeJson(root, 'package.json');
  const scripts = packageResult.ok && packageResult.value?.scripts ? packageResult.value.scripts : {};
  report.inventory.package_scripts = Object.keys(scripts).sort();
  if (!packageResult.ok) {
    addFinding(report, makeFinding({
      code: 'package_manifest_invalid',
      severity: 'critical',
      subject: 'package.json',
      detail: packageResult.reason,
      evidence_refs: ['repo:package.json']
    }));
  } else {
    for (const [scriptName, command] of Object.entries(scripts)) {
      for (const target of scriptFileTargets(command)) {
        const ok = exists(root, target);
        addCheck(report, `package-script-target:${scriptName}:${target}`, ok,
          ok ? 'present' : 'missing', [`repo:package.json`, `repo:${target}`]);
        if (!ok) {
          addFinding(report, makeFinding({
            code: 'package_script_target_missing',
            severity: 'high',
            subject: `${scriptName} -> ${target}`,
            detail: 'package.json references an executable file that does not exist.',
            evidence_refs: ['repo:package.json', `repo:${target}`],
            repair_mode: 'systemia_repair'
          }));
        }
      }
    }
  }

  for (const workflow of report.inventory.workflows) {
    const text = fs.readFileSync(path.join(root, workflow), 'utf8');
    const refs = workflowReferences(text);
    for (const scriptName of refs.npmScripts) {
      if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
        addFinding(report, makeFinding({
          code: 'workflow_script_missing',
          severity: 'high',
          subject: `${workflow} -> npm run ${scriptName}`,
          detail: 'GitHub Actions workflow references an npm script that is absent from package.json.',
          evidence_refs: [`repo:${workflow}`, 'repo:package.json'],
          repair_mode: 'systemia_repair'
        }));
      }
    }
    for (const target of refs.files) {
      if (!exists(root, target)) {
        addFinding(report, makeFinding({
          code: 'workflow_target_missing',
          severity: 'high',
          subject: `${workflow} -> ${target}`,
          detail: 'GitHub Actions workflow references a local executable file that does not exist.',
          evidence_refs: [`repo:${workflow}`, `repo:${target}`],
          repair_mode: 'systemia_repair'
        }));
      }
    }
  }

  const residentResult = safeJson(root, 'systemia/core/resident-services.json');
  if (residentResult.ok) {
    const services = Array.isArray(residentResult.value?.services) ? residentResult.value.services : [];
    report.inventory.resident_services = services.map((service) => ({
      service_key: clean(service?.service_key),
      mode: clean(service?.mode),
      manifest: clean(service?.manifest),
      executable: clean(service?.executable)
    }));
    for (const service of report.inventory.resident_services) {
      for (const [kind, target] of [['manifest', service.manifest], ['executable', service.executable]]) {
        if (!target) {
          addFinding(report, makeFinding({
            code: `resident_service_${kind}_missing`,
            severity: 'critical',
            subject: service.service_key || '<unnamed resident service>',
            detail: `Resident service has no ${kind} configured.`,
            evidence_refs: ['repo:systemia/core/resident-services.json']
          }));
          continue;
        }
        if (!exists(root, target)) {
          addFinding(report, makeFinding({
            code: `resident_service_${kind}_not_found`,
            severity: 'critical',
            subject: `${service.service_key} -> ${target}`,
            detail: `Resident service ${kind} target does not exist.`,
            evidence_refs: ['repo:systemia/core/resident-services.json', `repo:${target}`],
            repair_mode: 'systemia_repair'
          }));
        }
      }
    }
  } else {
    addFinding(report, makeFinding({
      code: 'resident_services_invalid',
      severity: 'critical',
      subject: 'systemia/core/resident-services.json',
      detail: residentResult.reason,
      evidence_refs: ['repo:systemia/core/resident-services.json']
    }));
  }

  const invariantResult = evaluateArchitecturalInvariants({ rootDir: root });
  report.inventory.architectural_invariants = invariantResult.checks || [];
  for (const check of invariantResult.checks || []) {
    addCheck(
      report,
      `architectural-invariant:${check.invariant_id}`,
      check.ok,
      check.ok ? 'architectural invariant satisfied' : `${check.violation_count} violation(s)`,
      ['repo:systemia/sentinel/architectural-invariants.json']
    );
  }
  for (const row of invariantResult.violations || []) {
    addFinding(report, makeFinding({
      code: 'architectural_invariant_violation',
      severity: row.severity || 'high',
      subject: row.invariant_id,
      detail: row.detail,
      evidence_refs: row.evidence_refs || ['repo:systemia/sentinel/architectural-invariants.json'],
      repair_mode: 'recipe_bound_repair',
      human_gate_required: true,
      metadata: {
        invariant_id: row.invariant_id,
        repair_recipe_id: row.repair_recipe_id || null,
        ...(row.metadata || {})
      }
    }));
  }

  const mirrorKeys = new Set(listDirNames(root, 'public/chum/products'));
  const mirrored = report.inventory.products.filter((product) => mirrorKeys.has(product.product_key)).length;
  report.inventory.discovery_mirror_coverage = {
    mirrored_products: mirrored,
    directory_products: report.inventory.products.length
  };
  addCheck(report, 'portfolio-inventory-loaded', true,
    `${report.inventory.products.length} products, ${report.inventory.registry_entries.length} registry entries, ${report.inventory.workflows.length} workflows, ${report.inventory.resident_services.length} resident services`);

  report.scanned = report.checks.length +
    report.inventory.products.length +
    report.inventory.workflows.length +
    report.inventory.resident_services.length +
    report.inventory.architectural_invariants.length;
  report.findings.sort((a, b) =>
    ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) -
    ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity) ||
    a.finding_key.localeCompare(b.finding_key)
  );
  return report;
}

export function buildPortfolioDelta(previousState = {}, findings = []) {
  const previous = new Map((previousState?.active_findings || []).map((row) => [row.finding_key, row]));
  const current = new Map((findings || []).map((row) => [row.finding_key, row]));
  const added = [];
  const changed = [];
  const persistent = [];
  const resolved = [];

  for (const [key, row] of current) {
    const prior = previous.get(key);
    if (!prior) added.push(row);
    else if (prior.signature !== row.signature) changed.push(row);
    else persistent.push(row);
  }
  for (const [key, row] of previous) {
    if (!current.has(key)) resolved.push(row);
  }

  return {
    schema: 'evercraft.portfolio-sentinel.delta.v1',
    added,
    changed,
    persistent,
    resolved,
    material_added_or_changed: [...added, ...changed].filter((row) => MATERIAL.has(row.severity))
  };
}

export function buildPortfolioRepairQueue(findings = [], delta = {}) {
  const newKeys = new Set([...(delta.added || []), ...(delta.changed || [])].map((row) => row.finding_key));
  return (findings || [])
    .filter((row) => MATERIAL.has(row.severity))
    .map((row) => ({
      schema: 'evercraft.portfolio-sentinel.repair-item.v1',
      finding_key: row.finding_key,
      status: newKeys.has(row.finding_key) ? 'new_or_changed' : 'persistent',
      severity: row.severity,
      code: row.code,
      subject: row.subject,
      detail: row.detail,
      repair_mode: row.repair_mode,
      repair_command: row.repair_command || null,
      human_gate_required: row.human_gate_required,
      assigned_agents: row.human_gate_required ? ['human-approved-operator'] : ['systemia-organism', 'saban'],
      evidence_refs: row.evidence_refs,
      repair_recipe: row.repair_recipe || null
    }))
    .slice(0, 200);
}

export function buildPortfolioMissionSnapshot({
  scanned = 0,
  delta,
  observedAt = new Date(),
  evidenceRefs = []
} = {}) {
  const material = delta?.material_added_or_changed || [];
  const changedCount = (delta?.added?.length || 0) + (delta?.changed?.length || 0) + (delta?.resolved?.length || 0);
  const at = observedAt instanceof Date ? observedAt.toISOString() : new Date(observedAt).toISOString();
  return {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: `portfolio-sentinel:${at}`,
    mission_key: PORTFOLIO_SENTINEL.mission_key,
    workflow_key: PORTFOLIO_SENTINEL.workflow_key,
    cadence_seconds: PORTFOLIO_SENTINEL.cadence_seconds,
    counts: {
      scanned: Math.max(Number(scanned || 0), changedCount),
      changed: changedCount,
      admitted: material.length,
      held: 0
    },
    evidence_refs: unique(evidenceRefs),
    observed_at: at
  };
}

export function createPortfolioSentinelGoal({ repairQueue = [], cycleKey, now = new Date() } = {}) {
  const state = createGoalState({
    goalKey: `portfolio-sentinel:${clean(cycleKey) || now.toISOString()}`,
    missionKey: PORTFOLIO_SENTINEL.mission_key,
    objective: PORTFOLIO_SENTINEL.objective,
    successCondition: PORTFOLIO_SENTINEL.success_condition,
    contextRefs: ['systemia:portfolio-sentinel', 'systemia:saban', 'systemia:kaidance', 'github:forge-operator'],
    now
  });

  const plan = (repairQueue || []).slice(0, 25).map((item) => ({
    work_key: `repair-${item.finding_key.replace(/[^a-z0-9]+/gi, '-').slice(-32)}`,
    dedupe_key: `portfolio-sentinel:${item.finding_key}`,
    title: `Repair portfolio drift: ${item.subject}`,
    work_type: item.repair_mode === 'verify_external_dependency' ? 'verify' : 'repair',
    human_gate_required: Boolean(item.human_gate_required),
    assigned_agents: item.assigned_agents || ['systemia-organism', 'saban'],
    context_refs: unique([...(item.evidence_refs || []), `finding:${item.finding_key}`])
  }));

  return admitGoalPlan({ state, plan, now });
}

export function buildSentinelState({ findings = [], observedAt = new Date() } = {}) {
  return {
    schema: 'evercraft.portfolio-sentinel.state.v1',
    observed_at: observedAt instanceof Date ? observedAt.toISOString() : new Date(observedAt).toISOString(),
    active_findings: (findings || []).map((row) => ({
      finding_key: row.finding_key,
      signature: row.signature,
      code: row.code,
      severity: row.severity,
      subject: row.subject
    }))
  };
}
