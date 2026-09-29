import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULT_MAX_BEHIND = 20;
export const HOT_DOMAINS = [
  ['workflows', (p) => p.startsWith('.github/workflows/')],
  ['runtime', (p) => ['package.json','package-lock.json','Dockerfile','server.ts'].includes(p)],
  ['chum', (p) => p.startsWith('systemia/chum/') || p.startsWith('public/chum/') || p === 'public/sitemap.xml'],
  ['rivet', (p) => p.startsWith('systemia/rivet/') || p.startsWith('public/rivet/') || p.includes('rivet')],
  ['registry', (p) => p.startsWith('registry/') || p.startsWith('mcp-registry/')],
  ['conformance', (p) => p.startsWith('conformance/') || p.startsWith('public/.well-known/')],
  ['coordination', (p) => p.startsWith('systemia/coordination/') || p.includes('merge-coordination')]
];

export const VOLATILE_GENERATED = [
  'public/chum/proof/',
  'public/chum/hot/',
  'public/chum/strike/',
  'public/chum/crawl-state.json',
  'public/chum/freshness.json',
  'public/chum/freshness.xml',
  'public/chum/crawler-radar.json',
  'public/chum/crawler-radar.txt',
  'artifacts/'
];

const uniq = (values) => [...new Set(values.filter(Boolean))];

export function domainsFor(files = []) {
  const out = new Set();
  for (const file of files) {
    for (const [name, match] of HOT_DOMAINS) {
      if (match(file)) out.add(name);
    }
  }
  return [...out].sort();
}

export function isVolatileGenerated(file = '') {
  return VOLATILE_GENERATED.some((prefix) => file === prefix || file.startsWith(prefix));
}

export function analyzeMergeAdmission({
  behindCount = 0,
  aheadCount = 0,
  changedFiles = [],
  baseChangedFiles = [],
  olderOpenPrCollisions = [],
  maxBehind = DEFAULT_MAX_BEHIND
} = {}) {
  const changed = uniq(changedFiles);
  const baseChanged = uniq(baseChangedFiles);
  const changedSet = new Set(changed);
  const exactOverlap = baseChanged.filter((file) => changedSet.has(file));
  const prDomains = domainsFor(changed);
  const baseDomains = domainsFor(baseChanged);
  const sharedHotDomains = prDomains.filter((domain) => baseDomains.includes(domain));
  const generatedOnly = changed.length > 0 && changed.every(isVolatileGenerated);
  const reasons = [];

  if (generatedOnly) {
    reasons.push({
      code: 'volatile_generated_only',
      message: 'This change contains only volatile generated state. Publish it through the owning workflow/artifact lane instead of competing with product code on main.'
    });
  }

  if (behindCount > maxBehind) {
    reasons.push({
      code: 'branch_too_stale',
      message: `Branch is ${behindCount} commits behind main; maximum tolerated drift is ${maxBehind}.`
    });
  }

  if (behindCount > 0 && exactOverlap.length) {
    reasons.push({
      code: 'stale_exact_overlap',
      message: `Main changed ${exactOverlap.length} file(s) also changed by this branch since the merge base.`
    });
  } else if (behindCount > 0 && sharedHotDomains.length) {
    reasons.push({
      code: 'stale_hot_domain',
      message: `Main and this branch both changed coordination-sensitive domain(s): ${sharedHotDomains.join(', ')}.`
    });
  }

  if (olderOpenPrCollisions.length) {
    reasons.push({
      code: 'older_pr_collision',
      message: `An older open PR already owns overlapping coordination-sensitive work: ${olderOpenPrCollisions.map((x) => '#' + x.number).join(', ')}.`
    });
  }

  return {
    schema: 'evercraft.systemia.merge-admission.v1',
    admitted: reasons.length === 0,
    behind_count: behindCount,
    ahead_count: aheadCount,
    max_behind: maxBehind,
    changed_files: changed,
    base_changed_files: baseChanged,
    exact_overlap: exactOverlap,
    hot_domains: prDomains,
    base_hot_domains: baseDomains,
    shared_hot_domains: sharedHotDomains,
    generated_only: generatedOnly,
    older_open_pr_collisions: olderOpenPrCollisions,
    reasons
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function lines(value) {
  return String(value || '').split('\n').map((x) => x.trim()).filter(Boolean);
}

async function findOlderPrCollisions({ repo, token, currentPrNumber, changedFiles }) {
  if (!repo || !token || !currentPrNumber) return [];
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Evercraft-Systemia-Merge-Control/1.0'
  };
  const pullsRes = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&sort=created&direction=asc&per_page=30`, { headers });
  if (!pullsRes.ok) return [];
  const pulls = await pullsRes.json();
  const currentDomains = domainsFor(changedFiles);
  if (!currentDomains.length) return [];
  const collisions = [];
  for (const pr of pulls) {
    if (!Number.isInteger(pr.number) || pr.number >= currentPrNumber) continue;
    const filesRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr.number}/files?per_page=100`, { headers });
    if (!filesRes.ok) continue;
    const files = (await filesRes.json()).map((row) => row.filename).filter(Boolean);
    const shared = domainsFor(files).filter((domain) => currentDomains.includes(domain));
    if (shared.length) collisions.push({ number: pr.number, title: pr.title || '', shared_hot_domains: shared });
  }
  return collisions;
}

async function main() {
  const base = process.env.SYSTEMIA_BASE_REF || process.env.GITHUB_BASE_REF || 'main';
  execFileSync('git', ['fetch','origin',base,'--quiet'], { stdio: 'inherit' });
  const remoteBase = `origin/${base}`;
  const mergeBase = git(['merge-base','HEAD',remoteBase]);
  const behindCount = Number(git(['rev-list','--count',`HEAD..${remoteBase}`]) || 0);
  const aheadCount = Number(git(['rev-list','--count',`${remoteBase}..HEAD`]) || 0);
  const changedFiles = lines(git(['diff','--name-only',`${mergeBase}..HEAD`]));
  const baseChangedFiles = lines(git(['diff','--name-only',`${mergeBase}..${remoteBase}`]));

  let currentPrNumber = Number(process.env.SYSTEMIA_PR_NUMBER || 0);
  if (!currentPrNumber && process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
      currentPrNumber = Number(event?.pull_request?.number || 0);
    } catch {}
  }

  const olderOpenPrCollisions = await findOlderPrCollisions({
    repo: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    currentPrNumber,
    changedFiles
  });

  const result = analyzeMergeAdmission({
    behindCount,
    aheadCount,
    changedFiles,
    baseChangedFiles,
    olderOpenPrCollisions,
    maxBehind: Number(process.env.SYSTEMIA_MAX_BEHIND || DEFAULT_MAX_BEHIND)
  });

  fs.mkdirSync('artifacts/coordination',{recursive:true});
  fs.writeFileSync('artifacts/coordination/merge-admission.json',JSON.stringify({
    ...result,
    base_ref: base,
    merge_base: mergeBase,
    head_sha: git(['rev-parse','HEAD']),
    base_sha: git(['rev-parse',remoteBase]),
    pr_number: currentPrNumber || null,
    generated_at: new Date().toISOString()
  },null,2)+'\n');

  const summary = [
    '## Systemia Merge Control',
    '',
    `Admission: **${result.admitted ? 'PASS' : 'HOLD'}**`,
    `Branch drift: ${behindCount} behind / ${aheadCount} ahead`,
    `Hot domains: ${result.hot_domains.join(', ') || 'none'}`,
    `Main hot domains since merge base: ${result.base_hot_domains.join(', ') || 'none'}`,
    `Exact overlap: ${result.exact_overlap.length}`,
    `Older PR collisions: ${result.older_open_pr_collisions.map((x)=>'#'+x.number).join(', ') || 'none'}`,
    ''
  ];
  for (const reason of result.reasons) summary.push(`- **${reason.code}**: ${reason.message}`);
  summary.push('');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary.join('\n'));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,[
      `admitted=${result.admitted ? 'true' : 'false'}`,
      `behind_count=${behindCount}`,
      `ahead_count=${aheadCount}`,
      `hot_domains=${result.hot_domains.join(',')}`
    ].join('\n')+'\n');
  }

  console.log(JSON.stringify(result,null,2));
  if (!result.admitted) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
