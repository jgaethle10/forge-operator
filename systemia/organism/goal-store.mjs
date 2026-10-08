import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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

/**
 * Filesystem directory creation is an atomic, cross-process single-writer fence.
 * An orphaned lock fails closed and requires operator review. Never auto-remove
 * a lock solely because its timestamp is old: the original writer may be alive.
 */
async function withGoalWriteLock(target, action) {
  const lockDir = target + '.lock';
  try {
    await mkdir(lockDir);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('goal state locked: concurrent writer or orphaned lock requires review');
    throw error;
  }
  try {
    return await action();
  } finally {
    await rmdir(lockDir);
  }
}

export async function writeGoalState(filePath, state, { expectedRevision = null, now = new Date() } = {}) {
  if (!clean(filePath)) throw new Error('filePath is required');
  assertGoalState(state);
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });

  return withGoalWriteLock(target, async () => {
    if (await exists(target)) {
      const current = await readGoalState(target);
      if (current.goal_key !== state.goal_key || current.mission_key !== state.mission_key) {
        throw new Error('goal identity conflict: stored goal or mission does not match');
      }
      if (expectedRevision !== null && current.revision !== expectedRevision) {
        throw new Error(`revision conflict: expected ${expectedRevision}, found ${current.revision}`);
      }
      if (state.revision <= current.revision) {
        throw new Error('revision conflict: new state must advance stored revision');
      }
    } else if (expectedRevision !== null && expectedRevision !== 0) {
      throw new Error(`revision conflict: expected ${expectedRevision}, found no state`);
    }

    const payload = JSON.stringify(state, null, 2) + '\n';
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }

    return {
      schema: 'evercraft.goal.storage-receipt.v1',
      goal_key: state.goal_key,
      revision: state.revision,
      file: target,
      sha256: hashJson(state),
      stored_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    };
  });
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
