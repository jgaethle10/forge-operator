import { execFileSync } from 'node:child_process';
import process from 'node:process';

export const RELEASE_POLICY_VERSION = 'systemia.release.policy.v1';

const TRUST_PATH = /(^|\/)(\.github\/workflows|systemia\/release|auth|authentication|authorization|security|secrets?|credentials?|payments?|billing|stripe)(\/|\.|$)|(^|\/)firestore\.rules$/i;
const DESTRUCTIVE_PATH = /(^|\/)(migrations?|destructive|data-purge|schema-drop)(\/|\.|$)/i;
const DESTRUCTIVE_PATCH = /^\+.*\b(drop\s+(table|database|schema)|truncate\s+table|rm\s+-rf|delete\s+from\s+[^\n]+\s+where\s+1\s*=\s*1)\b/im;
const TRUST_PATCH = /^\+.*\b(api[_-]?key|private[_-]?key|secret\s*=|password\s*=|authorization\s*:|stripe[_-]?secret)\b/im;

export function classifyRelease({ changedFiles = [], patch = '' } = {}) {
  const files = [...new Set(changedFiles.filter(Boolean))].sort();
  const reasons = [];

  for (const file of files) {
    if (DESTRUCTIVE_PATH.test(file)) reasons.push(`destructive_path:${file}`);
  }
  if (DESTRUCTIVE_PATCH.test(patch)) reasons.push('destructive_patch_pattern');

  if (reasons.length) {
    return {
      policyVersion: RELEASE_POLICY_VERSION,
      riskClass: 'destructive',
      requiresHumanApproval: true,
      autoReleaseAllowed: false,
      changedFiles: files,
      reasons,
    };
  }

  for (const file of files) {
    if (TRUST_PATH.test(file)) reasons.push(`trust_surface_path:${file}`);
  }
  if (TRUST_PATCH.test(patch)) reasons.push('secret_or_authorization_patch_pattern');

  if (reasons.length) {
    return {
      policyVersion: RELEASE_POLICY_VERSION,
      riskClass: 'trust_surface',
      requiresHumanApproval: true,
      autoReleaseAllowed: false,
      changedFiles: files,
      reasons,
    };
  }

  return {
    policyVersion: RELEASE_POLICY_VERSION,
    riskClass: 'routine_public',
    requiresHumanApproval: false,
    autoReleaseAllowed: true,
    changedFiles: files,
    reasons: ['verified_routine_change'],
  };
}

function gitText(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function classifyGitRange(base, head) {
  const changed = gitText(['diff', '--name-only', base, head]).split('\n').filter(Boolean);
  const patch = execFileSync('git', ['diff', '--unified=0', base, head], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return classifyRelease({ changedFiles: changed, patch });
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = arg('--base');
  const head = arg('--head') || 'HEAD';
  if (!base) {
    console.error('Usage: node systemia/release/release-policy.mjs --base <sha> [--head <sha>]');
    process.exit(2);
  }
  const result = classifyGitRange(base, head);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
