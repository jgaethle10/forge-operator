import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SCHEMA = 'evercraft.lineage.release.v1';

function safeSegment(value) {
  const out = String(value ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out || out === '.' || out === '..') throw new Error(`Invalid release segment: ${value}`);
  return out;
}

function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error('artifacts must be an array');
  return artifacts.map((artifact) => {
    const digest = String(artifact?.sha256 || '').trim();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Each release artifact requires a SHA-256 digest');
    return {
      name: String(artifact.name || '').trim() || digest.slice(0, 12),
      sha256: digest,
      media_type: artifact.media_type || null,
      bytes: Number.isFinite(Number(artifact.bytes)) ? Number(artifact.bytes) : null
    };
  });
}

export class ReleaseRegistry {
  constructor(store) {
    this.store = store;
  }

  pointerPath(channel, name) {
    return join(
      this.store.dir,
      'releases',
      safeSegment(channel),
      safeSegment(name)
    );
  }

  async readPointer({ channel = 'release', name }) {
    const path = this.pointerPath(channel, name);
    try {
      const releaseId = (await readFile(path, 'utf8')).trim() || null;
      if (!releaseId) return null;
      const object = await this.store.readObject(releaseId);
      if (object.type !== 'release') throw new Error(`Release pointer ${channel}/${name} does not target a release object`);
      return { release_id: releaseId, ...object.payload };
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async record({
    name,
    channel = 'release',
    commitish = 'HEAD',
    state = 'candidate',
    artifacts = [],
    authorityReceiptRefs = [],
    actor = { type: 'human', id: 'unknown' },
    expectedReleaseId = null,
    createdAt = new Date().toISOString(),
    metadata = {}
  }) {
    if (!['candidate', 'verified', 'released'].includes(state)) {
      throw new Error(`Unsupported release state: ${state}`);
    }
    if (!name) throw new Error('name is required');

    if (typeof this.store.assertGcUnlocked === 'function') {
      await this.store.assertGcUnlocked();
    }

    const commitId = await this.store.resolveRef(commitish);
    if (!commitId) throw new Error(`Cannot release empty ref: ${commitish}`);
    const commit = await this.store.readObject(commitId);
    if (commit.type !== 'commit') throw new Error(`${commitish} does not resolve to a commit`);

    const normalizedArtifacts = validateArtifacts(artifacts);
    const authorityRefs = [...new Set((authorityReceiptRefs || []).map(String).map((x) => x.trim()).filter(Boolean))];

    if (state === 'released' && authorityRefs.length === 0) {
      throw new Error('Released state requires at least one downstream authority receipt reference');
    }

    const current = await this.readPointer({ channel, name });
    const currentId = current?.release_id ?? null;
    if (currentId !== (expectedReleaseId || null)) {
      const error = new Error(`Stale release pointer for ${channel}/${name}: expected ${expectedReleaseId || '<empty>'}, current ${currentId || '<empty>'}`);
      error.code = 'STALE_RELEASE_POINTER';
      error.expected = expectedReleaseId || null;
      error.current = currentId;
      throw error;
    }

    const payload = {
      schema: SCHEMA,
      name: String(name),
      channel: String(channel),
      state,
      commit_id: commitId,
      tree_id: commit.payload.tree_id,
      artifacts: normalizedArtifacts,
      authority_receipt_refs: authorityRefs,
      actor,
      created_at: createdAt,
      metadata
    };
    const releaseId = await this.store.putObject('release', payload);

    if (typeof this.store.assertGcUnlocked === 'function') {
      await this.store.assertGcUnlocked();
    }

    const path = this.pointerPath(channel, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${releaseId}\n`, 'utf8');

    if (typeof this.store.assertGcUnlocked === 'function') {
      try {
        await this.store.assertGcUnlocked();
      } catch (error) {
        if (currentId) {
          await writeFile(path, `${currentId}\n`, 'utf8');
        } else {
          await rm(path, { force: true });
        }
        throw error;
      }
    }

    const receiptPayload = {
      operation: 'release_pointer_update',
      name: String(name),
      channel: String(channel),
      previous_release_id: currentId,
      release_id: releaseId,
      commit_id: commitId,
      state,
      actor,
      created_at: createdAt,
      authority_receipt_refs: authorityRefs,
      reversible_by: currentId
        ? { operation: 'restore_release_pointer', release_id: currentId }
        : { operation: 'delete_release_pointer' }
    };
    const receiptId = typeof this.store._recordOperation === 'function'
      ? await this.store._recordOperation(receiptPayload)
      : await this.store.putObject('receipt', {
          schema: 'evercraft.lineage.release-pointer-receipt.v1',
          ...receiptPayload
        });

    return {
      schema: SCHEMA,
      release_id: releaseId,
      receipt_id: receiptId,
      previous_release_id: currentId,
      name: String(name),
      channel: String(channel),
      state,
      commit_id: commitId,
      tree_id: commit.payload.tree_id,
      artifacts: normalizedArtifacts,
      authority_receipt_refs: authorityRefs
    };
  }
}

export const releases = { schema: SCHEMA };
