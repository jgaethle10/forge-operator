#!/usr/bin/env node
import { LineageStore } from './core.mjs';
import { semanticDiff } from './semantic-diff.mjs';

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
    default:
      console.log(`Evercraft Lineage\n\nCommands:\n  init [branch]\n  commit [message]\n  branch <name> [from]\n  switch <branch>\n  log [ref] [limit]\n  diff [from] [to]\n  restore <ref> [target]\n  rollback <ref>\n  merge-preview <branch>\n  merge <branch>`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, conflicts: error.conflicts ?? undefined }, null, 2));
  process.exitCode = 1;
});
