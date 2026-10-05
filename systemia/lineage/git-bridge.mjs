import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lineage } from './core.mjs';

function runGit(cwd, args, { input = undefined, env = {}, binary = false, allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    input,
    encoding: binary ? null : 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 128 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const stderr = binary ? Buffer.from(result.stderr || '').toString('utf8') : String(result.stderr || '');
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }
  return result;
}

function gitText(cwd, args, options = {}) {
  const result = runGit(cwd, args, options);
  return String(result.stdout || '').trim();
}

function gitBytes(cwd, args, options = {}) {
  const result = runGit(cwd, args, { ...options, binary: true });
  return Buffer.from(result.stdout || []);
}

function parseTree(buffer) {
  const rows = buffer.toString('utf8').split('\0').filter(Boolean);
  return rows.map((row) => {
    const tab = row.indexOf('\t');
    if (tab < 0) throw new Error(`Malformed git ls-tree row: ${row}`);
    const [mode, type, object] = row.slice(0, tab).split(' ');
    return { mode, type, object, path: row.slice(tab + 1) };
  });
}

function gitHead(repoDir, branch) {
  const result = runGit(repoDir, ['show-ref', '--verify', '--hash', `refs/heads/${branch}`], { allowFailure: true });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

export async function importGitHistory(store, {
  repository,
  ref = 'HEAD',
  branch = 'git/imported'
}) {
  const repoDir = resolve(repository);
  const root = gitText(repoDir, ['rev-parse', '--show-toplevel']);
  if (!root) throw new Error('Not a Git worktree');

  const commits = gitText(repoDir, ['rev-list', '--reverse', '--topo-order', ref])
    .split(/\r?\n/)
    .filter(Boolean);

  if (!commits.length) {
    return {
      schema: 'evercraft.lineage.git-import.v1',
      source_repository: root,
      source_ref: ref,
      imported_commits: 0,
      lineage_head: null
    };
  }

  const mapping = new Map();

  for (const gitSha of commits) {
    const treeRows = parseTree(gitBytes(repoDir, ['ls-tree', '-r', '-z', gitSha]));
    const entries = [];

    for (const row of treeRows) {
      if (row.type !== 'blob') {
        throw new Error(`Git object type ${row.type} at ${row.path} is not losslessly supported by Lineage import`);
      }
      const bytes = gitBytes(repoDir, ['cat-file', 'blob', row.object]);
      const contentSha256 = lineage.sha256(bytes);
      const objectId = await store.putObject('blob', {
        encoding: 'base64',
        size: bytes.length,
        content_sha256: contentSha256,
        data: bytes.toString('base64')
      });
      entries.push({
        path: row.path,
        kind: lineage.classifyAsset(row.path),
        mode: row.mode,
        object_id: objectId,
        content_sha256: contentSha256,
        bytes: bytes.length,
        metadata: { git_blob_sha: row.object }
      });
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    const treeId = await store.putObject('tree', { entries });

    const metaRaw = gitBytes(repoDir, [
      'show', '-s',
      '--format=%an%x00%ae%x00%aI%x00%B',
      gitSha
    ]).toString('utf8');
    const [authorName = '', authorEmail = '', authoredAt = '', ...messageParts] = metaRaw.split('\0');
    const message = messageParts.join('\0').trim() || `Import Git commit ${gitSha}`;
    const gitParents = gitText(repoDir, ['show', '-s', '--format=%P', gitSha]).split(/\s+/).filter(Boolean);
    const lineageParents = gitParents.map((sha) => {
      const mapped = mapping.get(sha);
      if (!mapped) throw new Error(`Git parent ${sha} was not imported before child ${gitSha}`);
      return mapped;
    });

    const commitId = await store.putObject('commit', {
      tree_id: treeId,
      parents: lineageParents,
      message,
      actor: {
        type: 'git_author',
        id: authorEmail || authorName || gitSha
      },
      rationale: 'Imported from Git history',
      created_at: authoredAt || new Date().toISOString(),
      provenance: {
        sources: [{
          type: 'git',
          repository: root,
          commit_sha: gitSha
        }],
        evidence: [],
        rights: []
      },
      authority: {
        mutation: false,
        publish: false,
        payment: false
      },
      transactions: [],
      metadata: {
        git: {
          commit_sha: gitSha,
          parents: gitParents,
          author_name: authorName,
          author_email: authorEmail
        }
      }
    });

    mapping.set(gitSha, commitId);
  }

  const sourceHead = commits.at(-1);
  const lineageHead = mapping.get(sourceHead);
  await store.writeRef(branch, lineageHead);

  const receiptId = await store.putObject('receipt', {
    schema: 'evercraft.lineage.git-import-receipt.v1',
    source_repository: root,
    source_ref: ref,
    source_git_head: sourceHead,
    lineage_branch: branch,
    lineage_head: lineageHead,
    imported_commits: commits.length,
    identity_mapping: Object.fromEntries(mapping),
    authority: {
      import_only: true,
      publish: false,
      deploy: false,
      payment: false
    }
  });

  return {
    schema: 'evercraft.lineage.git-import.v1',
    source_repository: root,
    source_ref: ref,
    source_git_head: sourceHead,
    lineage_branch: branch,
    lineage_head: lineageHead,
    imported_commits: commits.length,
    receipt_id: receiptId
  };
}

export async function exportLineageSnapshotToGit(store, {
  commitish = 'HEAD',
  repository,
  branch = 'lineage-export',
  expectedGitHead = null
}) {
  const repoDir = resolve(repository);
  await mkdir(repoDir, { recursive: true });

  const probe = runGit(repoDir, ['rev-parse', '--git-dir'], { allowFailure: true });
  if (probe.status !== 0) gitText(repoDir, ['init']);

  const currentHead = gitHead(repoDir, branch);
  if (currentHead !== (expectedGitHead || null)) {
    const error = new Error(`Stale Git ref update for ${branch}: expected ${expectedGitHead || '<empty>'}, current ${currentHead || '<empty>'}`);
    error.code = 'STALE_GIT_REF';
    error.expected = expectedGitHead || null;
    error.current = currentHead;
    throw error;
  }

  const tree = await store.getTree(commitish);
  if (!tree.commit_id) throw new Error(`Cannot export empty Lineage ref: ${commitish}`);
  const commit = await store.readObject(tree.commit_id);

  const gitDir = gitText(repoDir, ['rev-parse', '--git-dir']);
  const indexPath = resolve(repoDir, gitDir, `lineage-index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: indexPath };

  try {
    gitText(repoDir, ['read-tree', '--empty'], { env });

    for (const entry of tree.entries) {
      const blob = await store.readObject(entry.object_id);
      const bytes = Buffer.from(blob.payload.data, blob.payload.encoding);
      const gitBlob = gitText(repoDir, ['hash-object', '-w', '--stdin'], { input: bytes });
      const mode = /^[0-7]{6}$/.test(entry.mode || '') ? entry.mode : '100644';
      gitText(repoDir, ['update-index', '--add', '--cacheinfo', `${mode},${gitBlob},${entry.path}`], { env });
    }

    const gitTree = gitText(repoDir, ['write-tree'], { env });
    const lossyFields = ['provenance', 'authority', 'transactions', 'receipts', 'semantic_asset_types'];
    const message = [
      commit.payload.message || 'Lineage export',
      '',
      `Evercraft-Lineage-Commit: ${tree.commit_id}`,
      `Evercraft-Lineage-Export-Lossy: ${lossyFields.join(',')}`
    ].join('\n');

    const actorId = String(commit.payload.actor?.id || 'lineage@evercraft.local');
    const email = actorId.includes('@') ? actorId : 'lineage@evercraft.local';
    const name = String(commit.payload.actor?.id || 'Evercraft Lineage');
    const date = commit.payload.created_at || new Date().toISOString();
    const gitCommit = gitText(repoDir, ['commit-tree', gitTree, '-m', message], {
      env: {
        ...env,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: 'Evercraft Lineage',
        GIT_COMMITTER_EMAIL: 'lineage@evercraft.local',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date
      }
    });

    const zero = '0'.repeat(40);
    gitText(repoDir, ['update-ref', `refs/heads/${branch}`, gitCommit, currentHead || zero]);

    const receiptId = await store.putObject('receipt', {
      schema: 'evercraft.lineage.git-export-receipt.v1',
      lineage_commit: tree.commit_id,
      target_repository: repoDir,
      target_branch: branch,
      git_commit_sha: gitCommit,
      git_tree_sha: gitTree,
      files: tree.entries.length,
      lossless_artifact_bytes: true,
      lossy_lineage_fields: lossyFields,
      authority: {
        export_only: true,
        publish: false,
        deploy: false,
        payment: false
      }
    });

    return {
      schema: 'evercraft.lineage.git-export.v1',
      lineage_commit: tree.commit_id,
      git_commit_sha: gitCommit,
      git_tree_sha: gitTree,
      target_branch: branch,
      files: tree.entries.length,
      lossless_artifact_bytes: true,
      lossy_lineage_fields: lossyFields,
      receipt_id: receiptId
    };
  } finally {
    await rm(indexPath, { force: true });
  }
}
