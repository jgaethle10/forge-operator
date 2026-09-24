import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function clean(value) {
  return String(value ?? '').trim();
}

function assertGoalState(state) {
  if (!state || state.schema !== 'evercraft.goal.state.v1' || !clean(state.goal_key)) {
    throw new Error('valid evercraft.goal.state.v1 state is required');
  }
  if (!Number.isInteger(state.revision) || state.revision < 1) {
    throw new Error('goal state revision must be a positive integer');
  }
}

function hashJson(state) {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function readGoalState(filePath) {
  const target = path.resolve(clean(filePath));
  if (!clean(filePath)) throw new Error('filePath is required');
  const raw = await readFile(target, 'utf8');
  const state = JSON.parse(raw);
  assertGoalState(state);
  return state;
}

export async function writeGoalState(filePath, state, { expectedRevision = null, now = new Date() } = {}) {
  if (!clean(filePath)) throw new Error('filePath is required');
  assertGoalState(state);
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });

  if (await exists(target)) {
    const current = await readGoalState(target);
    if (expectedRevision !== null && current.revision !== expectedRevision) {
      throw new Error(`revision conflict: expected ${expectedRevision}, found ${current.revision}`);
    }
  } else if (expectedRevision !== null && expectedRevision !== 0) {
    throw new Error(`revision conflict: expected ${expectedRevision}, found no state`);
  }

  const payload = JSON.stringify(state, null, 2) + '\n';
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);

  return {
    schema: 'evercraft.goal.storage-receipt.v1',
    goal_key: state.goal_key,
    revision: state.revision,
    file: target,
    sha256: hashJson(state),
    stored_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
}

export async function createGoalStateFile(filePath, state, options = {}) {
  if (await exists(path.resolve(filePath))) throw new Error('goal state file already exists');
  return writeGoalState(filePath, state, { ...options, expectedRevision: 0 });
}

export async function mutateGoalState(filePath, mutate, { now = new Date() } = {}) {
  if (typeof mutate !== 'function') throw new Error('mutate function is required');
  const current = await readGoalState(filePath);
  const expectedRevision = current.revision;
  const next = await mutate(structuredClone(current));
  assertGoalState(next);
  if (next.goal_key !== current.goal_key) throw new Error('goal_key cannot change during mutation');
  if (next.revision <= expectedRevision) throw new Error('mutation must advance goal revision');
  const receipt = await writeGoalState(filePath, next, { expectedRevision, now });
  return { state: next, receipt };
}
