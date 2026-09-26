import fs from 'node:fs';
import path from 'node:path';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function readText(rootDir, relativePath) {
  const full = path.join(rootDir, relativePath);
  if (!fs.existsSync(full)) return { ok: false, reason: 'missing', text: '' };
  try {
    return { ok: true, reason: null, text: fs.readFileSync(full, 'utf8') };
  } catch (error) {
    return { ok: false, reason: clean(error?.message || error), text: '' };
  }
}

function readJson(rootDir, relativePath) {
  const raw = readText(rootDir, relativePath);
  if (!raw.ok) return { ok: false, reason: raw.reason, value: null };
  try {
    return { ok: true, reason: null, value: JSON.parse(raw.text) };
  } catch (error) {
    return { ok: false, reason: `invalid_json:${clean(error?.message || error)}`, value: null };
  }
}

function violation(invariant, detail, evidenceRefs = [], metadata = {}) {
  return {
    invariant_id: invariant.invariant_id,
    severity: invariant.severity || 'high',
    detail: clean(detail),
    evidence_refs: [...new Set(evidenceRefs.filter(Boolean))],
    repair_recipe_id: invariant.repair_recipe_id || null,
    metadata
  };
}

function evaluateFileContract(rootDir, invariant) {
  const raw = readText(rootDir, invariant.file);
  const evidence = [`repo:${invariant.file}`];
  if (!raw.ok) {
    return [violation(invariant, `Invariant source file unavailable: ${raw.reason}.`, evidence)];
  }

  const out = [];
  for (const literal of invariant.required_literals || []) {
    if (!raw.text.includes(literal)) {
      out.push(violation(invariant, `Required contract text is missing: ${literal}`, evidence, { missing_literal: literal }));
    }
  }
  for (const literal of invariant.forbidden_literals || []) {
    if (raw.text.includes(literal)) {
      out.push(violation(invariant, `Retired or forbidden contract text reappeared: ${literal}`, evidence, { forbidden_literal: literal }));
    }
  }
  for (const limit of invariant.occurrence_limits || []) {
    const literal = String(limit?.literal || '');
    if (!literal) continue;
    let count = 0;
    let offset = 0;
    while (true) {
      const index = raw.text.indexOf(literal, offset);
      if (index < 0) break;
      count += 1;
      offset = index + Math.max(1, literal.length);
    }
    const min = Number.isFinite(Number(limit?.min)) ? Number(limit.min) : 0;
    const max = Number.isFinite(Number(limit?.max)) ? Number(limit.max) : Number.POSITIVE_INFINITY;
    if (count < min || count > max) {
      out.push(violation(
        invariant,
        `Contract text occurrence count for ${literal} is ${count}; expected ${min}..${Number.isFinite(max) ? max : 'unbounded'}.`,
        evidence,
        { occurrence_literal: literal, count, min, max: Number.isFinite(max) ? max : null }
      ));
    }
  }
  for (const pattern of invariant.required_patterns || []) {
    let re;
    try { re = new RegExp(pattern, 'm'); } catch {
      out.push(violation(invariant, `Invariant has invalid required regex: ${pattern}`, evidence));
      continue;
    }
    if (!re.test(raw.text)) {
      out.push(violation(invariant, `Required contract pattern did not match: ${pattern}`, evidence, { missing_pattern: pattern }));
    }
  }
  for (const pattern of invariant.forbidden_patterns || []) {
    let re;
    try { re = new RegExp(pattern, 'ms'); } catch {
      out.push(violation(invariant, `Invariant has invalid forbidden regex: ${pattern}`, evidence));
      continue;
    }
    if (re.test(raw.text)) {
      out.push(violation(invariant, `Forbidden architecture pattern matched: ${pattern}`, evidence, { forbidden_pattern: pattern }));
    }
  }
  return out;
}

function directRuntimeImports(source, prefix) {
  const imports = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g
  ];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      const target = String(match[1] || '');
      if (target.startsWith(prefix)) imports.push(target.replace(/^\.\//, ''));
    }
  }
  return [...new Set(imports)].sort();
}

function dockerRuntimeCopies(text) {
  const runtimeIndex = text.search(/^FROM\s+\S+\s+AS\s+runtime\s*$/mi);
  const runtime = runtimeIndex >= 0 ? text.slice(runtimeIndex) : text;
  const copies = [];
  for (const line of runtime.split(/\r?\n/)) {
    const match = line.match(/^\s*COPY\s+--from=build\s+\/app\/([^\s]+)\s+([^\s]+)\s*$/i);
    if (!match) continue;
    copies.push({
      source: match[1].replace(/\/$/, ''),
      destination: match[2].replace(/^\.\//, '').replace(/\/$/, '')
    });
  }
  return copies;
}

function coveredByDockerCopy(importTarget, copies) {
  const normalized = importTarget.replace(/^\.\//, '').replace(/\/$/, '');
  return copies.some((copy) => {
    const source = copy.source;
    return normalized === source || normalized.startsWith(source + '/');
  });
}

function evaluateDockerCoverage(rootDir, invariant) {
  const entry = readText(rootDir, invariant.entrypoint);
  const docker = readText(rootDir, invariant.dockerfile);
  const evidence = [`repo:${invariant.entrypoint}`, `repo:${invariant.dockerfile}`];
  if (!entry.ok || !docker.ok) {
    return [violation(invariant, `Runtime coverage inputs unavailable: entrypoint=${entry.reason || 'ok'}, dockerfile=${docker.reason || 'ok'}.`, evidence)];
  }

  const imports = directRuntimeImports(entry.text, invariant.import_prefix || './systemia/');
  const copies = dockerRuntimeCopies(docker.text);
  const uncovered = imports.filter((target) => !coveredByDockerCopy(target, copies));
  if (!uncovered.length) return [];
  return [violation(
    invariant,
    `Production image does not copy ${uncovered.length} direct runtime import(s): ${uncovered.join(', ')}.`,
    evidence,
    { runtime_imports: imports, uncovered_imports: uncovered, runtime_copies: copies }
  )];
}

function nonempty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return String(value ?? '').trim().length > 0;
}

function evaluateSellNowCatalog(rootDir, invariant) {
  const parsed = readJson(rootDir, invariant.file);
  const evidence = [`repo:${invariant.file}`];
  if (!parsed.ok) return [violation(invariant, `Machine catalog unavailable: ${parsed.reason}.`, evidence)];
  const offers = Array.isArray(parsed.value?.offers) ? parsed.value.offers : [];
  const out = [];
  for (const offer of offers.filter((row) => row?.commercial_state === 'sell_now')) {
    const publicId = clean(offer.public_id) || '<missing-public-id>';
    const missing = (invariant.required_fields || []).filter((field) => !nonempty(offer?.[field]));
    if (invariant.require_nonempty_offers && !nonempty(offer?.offers)) missing.push('offers[]');
    if (missing.length) {
      out.push(violation(
        invariant,
        `Sell-now offer ${publicId} is missing continuation contract field(s): ${[...new Set(missing)].join(', ')}.`,
        evidence,
        { public_id: offer.public_id || null, missing_fields: [...new Set(missing)] }
      ));
    }
  }
  return out;
}

export function loadArchitecturalInvariantRegistry(rootDir = process.cwd()) {
  const parsed = readJson(rootDir, 'systemia/sentinel/architectural-invariants.json');
  if (!parsed.ok) return { ok: false, reason: parsed.reason, registry: null };
  return { ok: true, reason: null, registry: parsed.value };
}

export function loadRepairRecipeRegistry(rootDir = process.cwd()) {
  const parsed = readJson(rootDir, 'systemia/sentinel/repair-recipes.json');
  if (!parsed.ok) return { ok: false, reason: parsed.reason, registry: null };
  return { ok: true, reason: null, registry: parsed.value };
}

export function resolveRepairRecipe(finding, registry) {
  const recipes = Array.isArray(registry?.recipes) ? registry.recipes : [];
  const invariantId = finding?.metadata?.invariant_id || finding?.invariant_id || null;
  for (const recipe of recipes) {
    const codes = recipe?.match?.finding_codes || [];
    const invariantIds = recipe?.match?.invariant_ids || [];
    if (codes.includes(finding?.code) || (invariantId && invariantIds.includes(invariantId))) {
      return {
        recipe_id: recipe.recipe_id,
        authority: recipe.authority,
        action: recipe.action,
        verification: recipe.verification || [],
        rollback: recipe.rollback || null,
        learned_from: recipe.learned_from || null
      };
    }
  }
  return null;
}

export function evaluateArchitecturalInvariants({ rootDir = process.cwd(), registry = null } = {}) {
  const root = path.resolve(rootDir);
  const loaded = registry ? { ok: true, registry } : loadArchitecturalInvariantRegistry(root);
  if (!loaded.ok) {
    return {
      schema: 'evercraft.portfolio-sentinel.invariant-evaluation.v1',
      ok: false,
      checks: [],
      violations: [{
        invariant_id: 'invariant-registry-readable',
        severity: 'critical',
        detail: `Architectural invariant registry unavailable: ${loaded.reason}.`,
        evidence_refs: ['repo:systemia/sentinel/architectural-invariants.json'],
        repair_recipe_id: null,
        metadata: {}
      }]
    };
  }

  const checks = [];
  const violations = [];
  for (const invariant of loaded.registry?.invariants || []) {
    let found = [];
    if (invariant.type === 'file_contract') found = evaluateFileContract(root, invariant);
    else if (invariant.type === 'docker_runtime_import_coverage') found = evaluateDockerCoverage(root, invariant);
    else if (invariant.type === 'sell_now_catalog_contract') found = evaluateSellNowCatalog(root, invariant);
    else found = [violation(invariant, `Unsupported invariant type: ${invariant.type}.`, ['repo:systemia/sentinel/architectural-invariants.json'])];

    violations.push(...found);
    checks.push({
      invariant_id: invariant.invariant_id,
      ok: found.length === 0,
      severity: invariant.severity || 'high',
      type: invariant.type,
      violation_count: found.length,
      repair_recipe_id: invariant.repair_recipe_id || null
    });
  }

  return {
    schema: 'evercraft.portfolio-sentinel.invariant-evaluation.v1',
    ok: violations.length === 0,
    registry_version: loaded.registry?.version || null,
    checks,
    violations
  };
}
