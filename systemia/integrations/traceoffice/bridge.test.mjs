import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportSabanToTraceOffice, demoSnapshot } from './bridge.mjs';

const key = 'not-a-real-secret-demo-test-key-with-at-least-32-bytes';
const nowMs = Date.parse('2026-10-21T12:00:00Z');
const seed = () => ({
  schema: 'evercraft.saban.work-state.v1',
  software_id: 'safe-test',
  updated_at: new Date(nowMs).toISOString(),
  jobs: {
    'job-001': {
      job_id: 'job-001', software_id: 'safe-test', agent_id: 'private-agent-id-001',
      role: 'secret role', work: { kind: 'safe-test', key: 'confidential-project-123' },
      item: { customer: 'do-not-share', secret: 'REDACTION-CANARY' },
      state: 'queued', attempts: 0, max_attempts: 3, lease_seconds: 300,
      lease: null, result: null, error: null, updated_at: new Date(nowMs).toISOString(),
    },
  },
});
const takeLease=(state,clock=nowMs,seconds=300)=>{
  const job=state.jobs['job-001'];
  job.state='leased';
  job.lease={worker_id:'private-worker-xyz',heartbeat_at:new Date(clock).toISOString(),expires_at:new Date(clock+seconds*1000).toISOString()};
  job.updated_at=new Date(clock).toISOString();
  return job;
};
const exportAt = (s, k = key, clock = nowMs) => exportSabanToTraceOffice(s,{key:k,nowMs:clock,staleAfterMs:600_000});

// TraceOffice requires version 1, <=50 agents, unique IDs, valid states, and timestamps.
function traceOfficePublicContract(snapshot) {
  assert.equal(snapshot.version,1);
  assert.ok(Array.isArray(snapshot.agents) && snapshot.agents.length<=50);
  const ids=new Set();
  for(const a of snapshot.agents){
    assert.ok(a.id && a.name && a.harness && Number.isFinite(Date.parse(a.updatedAt)));
    assert.ok(['working','idle','blocked','error','offline','unknown'].includes(a.status));
    assert.equal(typeof a.model === 'string' || a.model === null,true);
    assert.equal(typeof a.task === 'string' || a.task === null,true);
    assert.equal(typeof a.contextUsed === 'number' || a.contextUsed === null,true);
    assert.equal(typeof a.contextWindow === 'number' || a.contextWindow === null,true);
    assert.ok(!ids.has(a.id)); ids.add(a.id);
  }
  for(const x of snapshot.interactions ?? []){
    assert.ok(ids.has(x.fromId)&&ids.has(x.toId)&&x.fromId!==x.toId);
    assert.ok(['delegation','message'].includes(x.kind)&&Number.isFinite(Date.parse(x.at)));
  }
}

test('synthetic demo matches documented snapshot shape and declares fictional state',()=>{
  const snap=demoSnapshot({nowMs});traceOfficePublicContract(snap);
  assert.equal(snap.agents.length,3);
  assert.equal(snap.interactions.length,2);
  assert.ok(snap.agents.every(a => a.name.includes('SYNTHETIC') && a.activityLabel.startsWith('SYNTHETIC')));
});
test('queued job is idle, never active, with deterministic HMAC stable IDs',()=>{
  const s=seed();const a=exportAt(s);const b=exportAt(s);
  traceOfficePublicContract(a);assert.deepEqual(a,b);
  assert.equal(a.agents[0].status,'idle');
  assert.equal(a.agents[0].model,null);
  assert.equal(a.agents[0].task,null);
  assert.deepEqual(a.interactions,[]);
});
test('real exporter strips raw IDs, payloads, secrets, paths, and error data',()=>{
  const s=seed();s.jobs[Object.keys(s.jobs)[0]].error={message:'REDACTION-CANARY',code:'private'};
  const text=JSON.stringify(exportAt(s));
  for(const forbidden of ['private-agent-id-001','confidential-project-123','REDACTION-CANARY','secret role','safe-test'])
    assert.ok(!text.includes(forbidden),forbidden);
});
test('fresh lease is working but unproven; stale heartbeat or expired lease unknown',()=>{
  const s=seed();const j=takeLease(s);
  assert.equal(exportAt(s).agents[0].status,'working');
  assert.match(exportAt(s).agents[0].activityLabel,/not independently verified/);
  assert.equal(exportAt(s,key,nowMs+601_000).agents[0].status,'unknown');
  assert.equal(exportAt(s,key,nowMs+301_000).agents[0].status,'unknown');
  const job=s.jobs[j.job_id];job.lease.expires_at=new Date(nowMs+1_000_000).toISOString();
  takeLease(s,nowMs+100_000,1100);
  assert.equal(exportAt(s,key,nowMs+110_000).agents[0].status,'working');
});
test('stale queued unknown, completed remains historical idle, dead_letter retains error',()=>{
  let s=seed();assert.equal(exportAt(s,key,nowMs+610_000).agents[0].status,'unknown');
  const leased=takeLease(s);
  leased.state='completed';leased.lease=null;leased.result={private:'REDACTION-CANARY'};
  const done=exportAt(s,key,nowMs+610_000);assert.equal(done.agents[0].status,'idle');
  assert.match(done.agents[0].activityLabel,/historical/);
  assert.ok(!JSON.stringify(done).includes('REDACTION-CANARY'));
  s=seed();const lease=takeLease(s);
  lease.state='dead_letter';lease.lease=null;lease.error={message:'REDACTION-CANARY'};
  assert.equal(exportAt(s).agents[0].status,'error');
});
test('invalid input and missing/short HMAC key fail closed',()=>{
  const s=seed();
  assert.throws(()=>exportSabanToTraceOffice(s),/TRACEOFFICE_EXPORT_KEY/);
  assert.throws(()=>exportAt({...s,schema:'not-saban'}),/invalid_saban/);
  assert.throws(()=>exportSabanToTraceOffice(s,{key:'a'}),/32/);
  s.jobs[Object.keys(s.jobs)[0]].updated_at='not-an-iso-date';
  assert.throws(()=>exportAt(s),/invalid_job_updated_at/);
});
test('more than 50 jobs fail rather than silently omit records',()=>{
  const s=seed();
  s.jobs=Object.fromEntries(Array.from({length:51},(_,i)=>[`job-${i}`,{...s.jobs['job-001'],job_id:`job-${i}`} ]));
  assert.throws(()=>exportAt(s),/limit_50/);
});
test('different pseudonym keys do not expose a stable cross-sharing ID',()=>{
  const s=seed();
  assert.notEqual(exportAt(s,key).agents[0].id, exportAt(s,'another-32-byte-private-test-key-not-real').agents[0].id);
});


const bridgeScript = fileURLToPath(new URL('./bridge.mjs', import.meta.url));
const cli = (args, env = {}) => spawnSync(process.execPath, [bridgeScript, ...args], {
  encoding: 'utf8', env: { ...process.env, TRACEOFFICE_EXPORT_KEY: key, ...env },
});

test('CLI synthetic demo emits valid v1 JSON without touching private data', () => {
  const result = cli(['--demo']);
  assert.equal(result.status, 0, result.stderr);
  traceOfficePublicContract(JSON.parse(result.stdout));
  assert.ok(JSON.parse(result.stdout).agents.every(x => x.activityLabel.startsWith('SYNTHETIC')));
});

test('CLI real export refuses terminal output and malformed repeated arguments', () => {
  for (const args of [['--input', 'private.json'], ['--demo', '--demo'],
                      ['--input', 'state.json', '--output'], ['--demo', 'surprise'],
                      ['--demo', '--input', 'state.json']]) {
    const result = cli(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.equal(result.stdout, '', 'no private snapshot in stdout');
  }
});

test('CLI private export uses an exclusive mode-0600 output and refuses overwrite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-traceoffice-cli-'));
  const source = path.join(root, 'internal-work-state.json');
  const output = path.join(root, 'private-snapshot.json');
  try {
    fs.writeFileSync(source, JSON.stringify(seed()));
    const first = cli(['--input', source, '--output', output]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, '', 'sensitive output must not be logged');
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    const raw = fs.readFileSync(output, 'utf8');
    traceOfficePublicContract(JSON.parse(raw));
    for (const forbidden of ['private-agent-id-001', 'confidential-project-123', 'REDACTION-CANARY'])
      assert.ok(!raw.includes(forbidden));
    const second = cli(['--input', source, '--output', output]);
    assert.notEqual(second.status, 0, 'existing snapshot must not be overwritten');
    assert.equal(fs.readFileSync(output, 'utf8'), raw, 'output remains unchanged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('source contract emits bounded labels compatible with TraceOffice current parser', () => {
  const s = seed();
  s.jobs['job-001'].state = 'dead_letter';
  const output = exportAt(s);
  for (const a of output.agents) {
    assert.ok(a.activityLabel.length <= 160);
    assert.ok(a.id.length <= 100);
  }
  assert.ok(output.interactions.length <= 100);
  traceOfficePublicContract(output);
});
