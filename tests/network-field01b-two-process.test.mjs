import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const cli = path.resolve('systemia/network/field01b-lan-cli.mjs');
const run = (...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 100000
  });
  if (r.error) throw r.error;
  let output = null;
  try { output = JSON.parse(r.stdout); } catch {}
  return { exit: r.status, output, error: r.stderr };
};
function receiveProcess(root, publicKey, keyFile) {
  const proc = spawn(process.execPath, [
    cli, 'listen', '--root', root, '--node', 'receiver-node002',
    '--peer-node', 'sender-node001', '--peer-public', publicKey,
    '--key', keyFile, '--bind', '127.0.0.1', '--port', '0'
  ], { stdio: ['ignore','pipe','pipe'] });
  let raw = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('field_receiver_start_timeout')), 10000);
    const done = (err, value) => {
      clearTimeout(timeout);
      if (err) reject(err);
      else resolve(value);
    };
    proc.stdout.on('data', bytes => {
      raw += bytes.toString('utf8');
      try {
        const result = JSON.parse(raw);
        done(null, result);
      } catch {}
    });
    proc.once('error', done);
    proc.once('exit', code => done(Error('field_receiver_exited_before_ready:' + code + ' ' + raw)));
  });
  return { proc, ready };
}
async function stopProcess(proc) {
  if (proc.exitCode !== null) return;
  await new Promise(resolve => {
    const t = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 3000);
    proc.once('exit', () => { clearTimeout(t); resolve(); });
    proc.kill('SIGINT');
  });
}

test('independent sender and receiver OS processes exchange signed synthetic LAN challenge and survive receiver restart', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-field01b-separate-processes-'));
  const sendRoot = path.join(base, 'sender');
  const recvRoot = path.join(base, 'receiver');
  const senderPub = path.join(sendRoot, '.identity', 'ed25519-public.pem');
  const receiverPub = path.join(recvRoot, '.identity', 'ed25519-public.pem');
  const labKeySender = path.join(sendRoot, 'field01b-lab-key.bin');
  const labKeyReceiver = path.join(recvRoot, 'field01b-lab-key.bin');
  let receiver = null;
  try {
    assert.equal(run('init','--root',sendRoot,'--node','sender-node001').exit, 0);
    assert.equal(run('init','--root',recvRoot,'--node','receiver-node002').exit, 0);
    assert.equal(run('new-key','--root',sendRoot).exit, 0);
    fs.copyFileSync(labKeySender, labKeyReceiver);
    fs.chmodSync(labKeyReceiver, 0o600);

    const queueArgs = ['queue','--root',sendRoot,'--node','sender-node001',
      '--peer-node','receiver-node002','--key',labKeySender];
    const deliverArgs = ['deliver','--root',sendRoot,'--node','sender-node001',
      '--peer-node','receiver-node002','--peer-public',receiverPub,
      '--key',labKeySender];
    assert.equal(run(...queueArgs).exit, 0);
    const offline = run(...deliverArgs,'--target','http://127.0.0.1:1/');
    assert.equal(offline.exit, 1);
    assert.equal(offline.output.observations[0].status, 'RETRY_PENDING');
    assert.equal(offline.output.remaining_queued, 1);

    receiver = receiveProcess(recvRoot, senderPub, labKeyReceiver);
    const live = await receiver.ready;
    assert.equal(live.state, 'SYNTHETIC_LAB_LISTENING');
    assert.equal(live.field01b_qualified, false);
    const delivered = run(...deliverArgs,'--target',live.url + '/');
    assert.equal(delivered.exit, 0, JSON.stringify(delivered));
    assert.equal(delivered.output.observations[0].status, 'DELIVERED');
    assert.equal(delivered.output.verified_physical_devices, false);
    assert.equal(delivered.output.remaining_queued, 0);

    await stopProcess(receiver.proc); receiver = null;
    receiver = receiveProcess(recvRoot, senderPub, labKeyReceiver);
    const restarted = await receiver.ready;
    assert.equal(run(...queueArgs).exit, 0);
    const next = run(...deliverArgs,'--target',restarted.url + '/');
    assert.equal(next.exit, 0, JSON.stringify(next));
    assert.equal(next.output.observations[0].status, 'DELIVERED');
    assert.equal(next.output.verified_cellular_service, false);
  } finally {
    if (receiver) await stopProcess(receiver.proc);
    fs.rmSync(base, { recursive: true, force: true });
  }
});
