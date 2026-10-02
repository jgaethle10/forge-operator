#!/usr/bin/env node
import { LineageStore } from './core.mjs';
import { semanticDiff } from './semantic-diff.mjs';
import { LargeObjectStore } from './large-object.mjs';
import { exportLineageSnapshotToGit, importGitHistory } from './git-bridge.mjs';
import { buildHistoryGraph, writeHistoryBundle } from './history-view.mjs';
import { LocalLineageRemote, fetchCommitGraph, pushCommitGraph } from './remote-protocol.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const store = new LineageStore(process.cwd());
const [command, ...args] = process.argv.slice(2);

function actor() {
  return { type: process.env.EVERCRAFT_ACTOR_TYPE || 'human', id: process.env.EVERCRAFT_ACTOR_ID || process.env.USER || 'unknown' };
}

async function main() {
  switch (command) {
    case 'init':
      console.log(JSON.stringify(await store.init({ branch: args[0] || 'main' }), null, 2));
      break;
    case 'commit': {
      const message = args.join(' ').trim() || 'checkpoint';
      console.log(JSON.stringify(await store.commit({ message, actor: actor() }), null, 2));
      break;
    }
    case 'branch':
      if (!args[0]) throw new Error('Usage: lineage branch <name> [from]');
      console.log(JSON.stringify(await store.createBranch(args[0], args[1] || 'HEAD'), null, 2));
      break;
    case 'switch':
      if (!args[0]) throw new Error('Usage: lineage switch <branch>');
      console.log(JSON.stringify(await store.switchBranch(args[0]), null, 2));
      break;
    case 'log':
      console.log(JSON.stringify(await store.log(args[0] || 'HEAD', Number(args[1] || 20)), null, 2));
      break;
    case 'diff':
      console.log(JSON.stringify(await store.diff(args[0] || 'HEAD', args[1] || null), null, 2));
      break;
    case 'semantic-diff':
      console.log(JSON.stringify(await semanticDiff(store, args[0] || 'HEAD', args[1] || null), null, 2));
      break;
    case 'restore':
      if (!args[0]) throw new Error('Usage: lineage restore <commit-or-branch> [target-dir]');
      console.log(JSON.stringify(await store.restore(args[0], args[1] || process.cwd()), null, 2));
      break;
    case 'rollback':
      if (!args[0]) throw new Error('Usage: lineage rollback <commit-or-branch>');
      console.log(JSON.stringify(await store.rollback(args[0], { actor: actor() }), null, 2));
      break;
    case 'merge':
      if (!args[0]) throw new Error('Usage: lineage merge <branch>');
      console.log(JSON.stringify(await store.merge(args[0], { actor: actor() }), null, 2));
      break;
    case 'merge-preview':
      if (!args[0]) throw new Error('Usage: lineage merge-preview <branch>');
      console.log(JSON.stringify(await store.mergePreview(args[0]), null, 2));
      break;
    case 'large-put': {
      if (!args[0]) throw new Error('Usage: lineage large-put <file> [media-type]');
      const bytes = await readFile(args[0]);
      const large = new LargeObjectStore(join(store.dir));
      console.log(JSON.stringify(await large.putBuffer(bytes, {
        logicalName: args[0],
        mediaType: args[1] || 'application/octet-stream'
      }), null, 2));
      break;
    }
    case 'large-verify': {
      if (!args[0]) throw new Error('Usage: lineage large-verify <manifest-id>');
      const large = new LargeObjectStore(join(store.dir));
      console.log(JSON.stringify(await large.verify(args[0]), null, 2));
      break;
    }
    case 'remote-refs': {
      if (!args[0]) throw new Error('Usage: lineage remote-refs <remote-dir>');
      const remote = new LocalLineageRemote(args[0]);
      await remote.init();
      console.log(JSON.stringify(await remote.advertiseRefs(), null, 2));
      break;
    }
    case 'remote-push': {
      if (!args[0]) throw new Error('Usage: lineage remote-push <remote-dir> [branch] [expected-head]');
      const remote = new LocalLineageRemote(args[0]);
      const branch = args[1] || await store.currentBranch();
      const expectedRemoteHead = !args[2] || args[2] === 'null' ? null : args[2];
      console.log(JSON.stringify(await pushCommitGraph({
        store,
        remote,
        branch,
        expectedRemoteHead
      }), null, 2));
      break;
    }
    case 'remote-fetch': {
      if (!args[0]) throw new Error('Usage: lineage remote-fetch <remote-dir> [remote-branch] [local-branch]');
      const remote = new LocalLineageRemote(args[0]);
      const remoteBranch = args[1] || 'main';
      const localBranch = args[2] || remoteBranch;
      console.log(JSON.stringify(await fetchCommitGraph({
        store,
        remote,
        remoteBranch,
        localBranch
      }), null, 2));
      break;
    }
    case 'git-import': {
      if (!args[0]) throw new Error('Usage: lineage git-import <git-repo-dir> [git-ref] [lineage-branch]');
      console.log(JSON.stringify(await importGitHistory(store, {
        repository: args[0],
        ref: args[1] || 'HEAD',
        branch: args[2] || 'git/imported'
      }), null, 2));
      break;
    }
    case 'git-export': {
      if (!args[0]) throw new Error('Usage: lineage git-export <git-repo-dir> [lineage-ref] [git-branch] [expected-git-head]');
      console.log(JSON.stringify(await exportLineageSnapshotToGit(store, {
        repository: args[0],
        commitish: args[1] || 'HEAD',
        branch: args[2] || 'lineage-export',
        expectedGitHead: !args[3] || args[3] === 'null' ? null : args[3]
      }), null, 2));
      break;
    }
    case 'history': {
      console.log(JSON.stringify(await buildHistoryGraph(store, {
        ref: args[0] || 'HEAD',
        limit: Number(args[1] || 100)
      }), null, 2));
      break;
    }
    case 'history-export': {
      if (!args[0]) throw new Error('Usage: lineage history-export <out-dir> [ref] [limit]');
      console.log(JSON.stringify(await writeHistoryBundle(store, {
        outDir: args[0],
        ref: args[1] || 'HEAD',
        limit: Number(args[2] || 100)
      }), null, 2));
      break;
    }
    default:
      console.log(`Evercraft Lineage\n\nCommands:\n  init [branch]\n  commit [message]\n  branch <name> [from]\n  switch <branch>\n  log [ref] [limit]\n  diff [from] [to]\n  restore <ref> [target]\n  rollback <ref>\n  merge-preview <branch>\n  merge <branch>\n  large-put <file> [media-type]\n  large-verify <manifest-id>\n  remote-refs <remote-dir>\n  remote-push <remote-dir> [branch] [expected-head]\n  remote-fetch <remote-dir> [remote-branch] [local-branch]\n  git-import <git-repo-dir> [git-ref] [lineage-branch]\n  git-export <git-repo-dir> [lineage-ref] [git-branch] [expected-git-head]\n  history [ref] [limit]\n  history-export <out-dir> [ref] [limit]`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, conflicts: error.conflicts ?? undefined }, null, 2));
  process.exitCode = 1;
});
