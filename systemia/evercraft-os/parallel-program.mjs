#!/usr/bin/env node
/** Read-only OS/Saban program preflight. No Systemia admission, dispatch, lease or side effects. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_MANIFEST = resolve(HERE, 'parallel-program.json');
const DEFAULT_REGISTRY = resolve(DEFAULT_ROOT, 'systemia/saban/multiplication-registry.json');
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const URL_PATTERN = /^https:\/\/github\.com\/jgaethle10\/forge-operator\/(?:issues|pull|blob)\/\S+$/;
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

export function validateProgram(program, { registry = { software: [] } } = {}) {
  if (program?.schema !== 'evercraft.os.parallel-program.v1') throw new Error('program_schema_mismatch');
  if (program.state !== 'proposal_not_admitted' || program.mode !== 'read_only_preflight') throw new Error('false_execution_state');
  if (program.mission_authority !== 'systemia' || program.multiplication_authority !== 'saban') throw new Error('authority_mismatch');
  for (const field of ['execution_authority_granted','budget_commitment_authorized','public_deployment_authorized']) {
    if (program[field] !== false) throw new Error('unauthorized_flag:' + field);
  }
  if (!Array.isArray(program.lanes) || program.lanes.length !== 12) throw new Error('expected_12_independent_lanes');
  const ids = new Set();
  const software = new Set((registry.software || []).map(x => x.software_id));
  for (const lane of program.lanes) {
    if (typeof lane.id !== 'string' || !ID_PATTERN.test(lane.id) || ids.has(lane.id)) throw new Error('invalid_or_duplicate_lane:' + lane.id);
    ids.add(lane.id);
    if (![lane.objective,lane.owner,lane.acceptance].every(x => typeof x === 'string' && x.trim().length >= 12)) throw new Error('missing_lane_contract:' + lane.id);
    if (!Array.isArray(lane.source_anchors) || !lane.source_anchors.length ||
      !lane.source_anchors.every(x => typeof x === 'string' && x.startsWith('systemia/') && !x.includes('..'))) throw new Error('invalid_source_anchor:' + lane.id);
    if (!Array.isArray(lane.existing_work) || !lane.existing_work.length ||
      !lane.existing_work.every(x => URL_PATTERN.test(x))) throw new Error('invalid_existing_work:' + lane.id);
    if (lane.saban_registered_software && !software.has(lane.saban_registered_software)) throw new Error('unregistered_saban_software:' + lane.id);
    if (lane.depends_on?.length) throw new Error('lane_not_independent:' + lane.id);
  }
  return true;
}

export function assessProgram(program, { registry = { software: [] }, rootDir = DEFAULT_ROOT, sourceExists = existsSync } = {}) {
  validateProgram(program, { registry });
  const registered = new Set(registry.software.map(x => x.software_id));
  const lanes = program.lanes.map(lane => {
    const missing_sources = lane.source_anchors.filter(x => !sourceExists(resolve(rootDir, x)));
    return {
      lane_id: lane.id,
      owner: lane.owner,
      sources_present: !missing_sources.length,
      missing_sources,
      existing_work: lane.existing_work,
      source_preflight: missing_sources.length ? 'blocked_missing_source' : 'source_anchors_found',
      saban_software_registered: Boolean(lane.saban_registered_software && registered.has(lane.saban_registered_software)),
      saban_execution_authorized: false,
      systemia_mission_admitted: false,
      live_execution_observed: false,
      completion_receipted: false,
      next_action: 'Obtain approved Systemia admission and independent proof for: ' + lane.acceptance
    };
  });
  return {
    schema: 'evercraft.os.parallel-program.preflight.v1',
    mission_key: program.mission_key,
    outcome: lanes.some(x => x.missing_sources.length) ? 'held_source_gaps' : 'source_preflight_only',
    lane_count: lanes.length,
    parallel_readiness_wave: lanes.map(x => x.lane_id),
    source_ready_count: lanes.filter(x => x.sources_present).length,
    actual_saban_workers_launched: 0,
    execution_authority_granted: false,
    payments_collected: false,
    external_changes_made: false,
    lanes
  };
}

export function runPreflight({ manifestFile = DEFAULT_MANIFEST, registryFile = DEFAULT_REGISTRY, rootDir = DEFAULT_ROOT } = {}) {
  return assessProgram(readJson(manifestFile), { registry: readJson(registryFile), rootDir });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(runPreflight(), null, 2) + '\n');
}
