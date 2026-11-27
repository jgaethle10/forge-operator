import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repository = 'jgaethle10/forge-operator';
const source = 'https://github.com/' + repository;
const timezone = 'America/Los_Angeles';
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', hourCycle: 'h23'
});
const programs = [
  ['aerospace-continuity', 'issues', 2213, 'Recover source for the historical drone and space projects. Historical designs remain unverified.'],
  ['anniston-aaar', 'pulls', 2288, 'Review the browser simulator separately from flight, hardware, and Safari device acceptance.'],
  ['flight-sentinel', 'pulls', 1882, 'Obtain a pinned synthetic-campaign receipt and close the model and review gaps in the mission record.'],
  ['air-relay', 'pulls', 306, 'Reconcile the software evidence with the AAAR registry. Physical radio performance is unverified.'],
  ['earthworks-fleet', 'pulls', 934, 'Review the deterministic simulator proof. Full-size equipment performance is unverified.'],
  ['earthworks-embodied-ai', 'pulls', 1268, 'Review source and trust boundaries. Obtain a separate bench receipt before assigning a bench milestone.'],
  ['toy-yard-002', 'issues', 907, 'Locate a physical test receipt for the miniature fleet. The acceptance plan alone leaves bench results unverified.'],
  ['space-systems', 'pulls', 2121, 'Trace a reproducible link-failure simulation. Opportunity intake leaves simulation and submissions unverified.']
];
const simulation = 'systemia/earthworks-autonomy/fleet-controller.test.mjs';
const controller = 'systemia/earthworks-autonomy/fleet-controller.mjs';

function localDate(date) {
  const parts = Object.fromEntries(clock.formatToParts(date).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

async function githubRecord(endpoint, token) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'evercraft-kaidance-engineering-log' };
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await fetch('https://api.github.com/repos/' + repository + '/' + endpoint, {
    headers, redirect: 'error', signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw Error('github_http_' + response.status);
  return response.json();
}

async function proveSimulation(root) {
  const invocation = { cwd: root, timeout: 10_000, maxBuffer: 64 * 1024, env: { PATH: process.env.PATH } };
  let revision = null;
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], invocation);
    if (/^[a-f0-9]{40}$/.test(stdout.trim())) revision = stdout.trim();
  } catch {
    // Packaged releases can lack git metadata. File hashes still identify the inputs.
  }
  const evidence = { command: 'node --test ' + simulation, checkout_revision: revision, inputs: [] };
  try {
    for (const file of [simulation, controller]) {
      const content = await fs.readFile(path.join(root, file));
      const digest = createHash('sha256').update(content).digest('hex');
      let link = null;
      if (revision) {
        const { stdout } = await run('git', ['show', revision + ':' + file], { ...invocation, encoding: 'buffer' }).catch(() => ({}));
        if (stdout?.equals(content)) link = source + '/blob/' + revision + '/' + file;
      }
      evidence.inputs.push({ file, sha256: digest, source_url: link });
    }
    const { stdout } = await run(process.execPath, ['--test', simulation], invocation);
    return {
      ...evidence, status: 'demonstrated_simulation', output: stdout,
      result: 'The local deterministic EarthWorks fleet test suite passed. Individual simulated outcomes are recorded in the test output.'
    };
  } catch (error) {
    return { ...evidence, status: 'simulation_unverified', output: String(error.stdout || '').slice(0, 8192) };
  }
}

export async function runFridayEngineeringLog({
  root, outDir, now = new Date(), token = '', readRecord = githubRecord, runSimulation = proveSimulation
}) {
  const { year, month, day, weekday, hour } = Object.fromEntries(clock.formatToParts(now).map(({type, value}) => [type, value]));
  if (weekday !== 'Fri' || Number(hour) < 9) return { status: 'not_due' };
  const friday = [year, month, day].join('-');
  const previousFriday = new Date(Date.parse(friday) - 7 * 86400_000).toISOString().slice(0, 10);
  const target = path.join(outDir, friday + '.json');
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  const dir = await fs.lstat(outDir);
  if (!dir.isDirectory() || (dir.mode & 0o077)) throw Error('engineering_log_private_directory_required');
  const existing = await fs.lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (existing?.isFile()) return { status: 'already_compiled', friday };
  if (existing) throw Error('engineering_log_regular_file_required');

  const snapshot = await Promise.allSettled(programs.map(async ([program, kind, number, next]) => {
    const record = await readRecord(kind + '/' + number, token);
    if (record.number !== number || !['open', 'closed'].includes(record.state) || !record.updated_at) {
      throw Error('github_record_invalid');
    }
    return {
      program, next_action: next, record_state: record.state, draft: record.draft ?? null,
      record_updated_at: record.updated_at, merged_at: record.merged_at ?? null,
      revision: record.merge_commit_sha && record.merged_at ? record.merge_commit_sha : record.head?.sha ?? null,
      evidence_level: record.merged_at ? 'merged_source' : kind === 'pulls' ? 'proposed_source' : 'tracking_record',
      updated_during_review_period: localDate(new Date(record.updated_at)) >= previousFriday,
      evidence_url: source + '/' + (kind === 'pulls' ? 'pull' : 'issues') + '/' + number
    };
  }));
  const entries = snapshot.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const [program, kind, number, next] = programs[index];
    return {
      program, evidence_level: 'source_unavailable', next_action: next,
      evidence_url: source + '/' + (kind === 'pulls' ? 'pull' : 'issues') + '/' + number
    };
  });
  const report = {
    schema: 'evercraft.portfolio.engineering-log.v1',
    review_status: 'registry_review_pending',
    mission_url: source + '/issues/2213',
    friday, timezone, previous_friday: previousFriday, compiled_at: now.toISOString(),
    coverage: entries.some(entry => entry.evidence_level === 'source_unavailable') ? 'partial' : 'complete',
    entries,
    simulation_results: [{ program: 'earthworks-fleet', ...await runSimulation(root) }],
    evidence_limits: 'Source and synthetic evidence only. Bench, field, operational, and certification results require separate evidence.'
  };

  const temporary = path.join(outDir, '.' + randomUUID() + '.tmp');
  try {
    await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      return { status: 'already_compiled', friday };
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return { status: 'compiled', friday, coverage: report.coverage };
}
