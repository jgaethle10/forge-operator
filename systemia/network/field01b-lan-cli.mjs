#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadOrCreateDeviceIdentity, fingerprintPublicKey } from '../compute/device-identity.mjs';
import {
  startField01BLanReceiver, enqueueField01BSynthetic, deliverField01BQueued
} from './field01b-lan-lab.mjs';

// Narrow operator-driven tool. Nothing runs without an explicit command.
// Only synthetic encrypted challenges; no messages, telemetry, subscriber data,
// radio control, real carrier integration, discovery or unattended enrollment.

const usage = () => {
  process.stderr.write([
    'Evercraft Network Field01B authorized synthetic LAN lab',
    '  init       --root ABS --node DEVICE_ID',
    '  new-key    --root ABS',
    '  listen     --root ABS --node RECEIVER --peer-node SENDER --peer-public ABS --key ABS --bind IPv4 [--port 42440] [--consent-lan]',
    '  queue      --root ABS --node SENDER --peer-node RECEIVER --key ABS',
    '  deliver    --root ABS --node SENDER --peer-node RECEIVER --peer-public ABS --key ABS --target http://PRIVATE_IP:PORT/ [--consent-lan]',
    'No production use. Do not share private identity keys; copy lab symmetric key only by an explicitly authorized secure method.'
  ].join('\n') + '\n');
};
const fail = reason => { throw new Error(reason); };
const args = process.argv.slice(2);
const command = args.shift();
const flags = new Map();
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (!/^--[a-z-]+$/.test(name) || flags.has(name)) fail('field_cli_unknown_or_duplicate_option');
  if (name === '--consent-lan') { flags.set(name, true); continue; }
  if (!args[i+1] || args[i+1].startsWith('--')) fail('field_cli_option_value_required');
  flags.set(name, args[++i]);
}
const permitted = {
  init: ['--root','--node'],
  'new-key': ['--root'],
  listen: ['--root','--node','--peer-node','--peer-public','--key','--bind','--port','--consent-lan'],
  queue: ['--root','--node','--peer-node','--key'],
  deliver: ['--root','--node','--peer-node','--peer-public','--key','--target','--consent-lan'],
};
if (!permitted[command] || [...flags.keys()].some(k => !permitted[command].includes(k))) {
  usage(); process.exit(2);
}
function absolute(name) {
  const p = flags.get(name);
  if (typeof p !== 'string' || !path.isAbsolute(p)) fail(name + '_must_be_absolute_path');
  return p;
}
function ownedFile(p, secret = false) {
  if (!path.isAbsolute(p)) fail('field_file_path_not_absolute');
  const st = fs.lstatSync(p);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 4096 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid()) ||
      (secret && (st.mode & 0o077) !== 0)) fail('field_file_not_owned_regular_or_secure');
  return fs.readFileSync(p);
}
function rootDir({ create = false } = {}) {
  const root = absolute('--root');
  if (create) fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(root);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid())) fail('field_root_not_private');
  return root;
}
function nodeId(name) {
  const id = flags.get(name);
  if (typeof id !== 'string' || !/^[a-z][a-z0-9._:-]{2,79}$/.test(id)) fail(name + '_invalid');
  return id;
}
function identity(root) {
  const node = nodeId('--node');
  const dir = path.join(root, '.identity');
  const privateKeyFile = path.join(dir, 'ed25519-private.pem');
  const publicKeyFile = path.join(dir, 'ed25519-public.pem');
  // Only explicit init may generate identity files.
  ownedFile(privateKeyFile, true);
  ownedFile(publicKeyFile);
  return loadOrCreateDeviceIdentity({ root, nodeId: node });
}
function labKey() {
  const key = ownedFile(absolute('--key'), true);
  if (key.length !== 32) fail('field_lab_key_must_be_32_raw_bytes');
  return key;
}
function peerKey() {
  return ownedFile(absolute('--peer-public')).toString('utf8');
}
function outbox(root) { return path.join(root, 'field01b-outbox'); }
function receiverState(root) { return path.join(root, 'field01b-replay'); }
function show(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }

try {
  if (command === 'init') {
    const root = rootDir({ create: true });
    const i = loadOrCreateDeviceIdentity({ root, nodeId: nodeId('--node') });
    show({ state: 'IDENTITY_INITIALIZED', node_id: i.node_id,
      fingerprint: fingerprintPublicKey(i.public_key_pem),
      public_key_file: path.join(root, '.identity', 'ed25519-public.pem'),
      private_key_exported: false, physical_field_verified: false });
  } else if (command === 'new-key') {
    const root = rootDir();
    const file = path.join(root, 'field01b-lab-key.bin');
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeSync(fd, crypto.randomBytes(32)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    show({ state: 'SYNTHETIC_LAB_KEY_CREATED', key_file: file,
      raw_key_printed: false, production_use_allowed: false });
  } else if (command === 'listen') {
    const root = rootDir(), i = identity(root);
    const host = flags.get('--bind');
    if (typeof host !== 'string') fail('field_bind_address_required');
    const port = flags.has('--port') ? Number(flags.get('--port')) : 42440;
    const server = await startField01BLanReceiver({
      bindAddress: host, port, identity: i, senderNodeId: nodeId('--peer-node'),
      senderPublicKeyPem: peerKey(), labKey: labKey(),
      stateDir: receiverState(root), operatorConsent: flags.get('--consent-lan') === true,
      trialMs: 120_000
    });
    show({ state: 'SYNTHETIC_LAB_LISTENING', url: server.url,
      pinned_sender_fingerprint: server.pinned_sender_fingerprint,
      auto_stop_seconds: 120, verified_radio_link: false,
      field01b_qualified: false });
    process.once('SIGINT', () => { server.stop().catch(() => { process.exitCode = 1; }); });
  } else if (command === 'queue') {
    const root = rootDir(), i = identity(root);
    show(enqueueField01BSynthetic({
      courierRoot: outbox(root), identity: i,
      receiverNodeId: nodeId('--peer-node'), labKey: labKey()
    }));
  } else if (command === 'deliver') {
    const root = rootDir(), i = identity(root);
    const report = await deliverField01BQueued({
      courierRoot: outbox(root), identity: i,
      receiverNodeId: nodeId('--peer-node'), receiverPublicKeyPem: peerKey(),
      labKey: labKey(), target: flags.get('--target'),
      operatorConsent: flags.get('--consent-lan') === true
    });
    show(report);
    if (report.remaining_queued > 0 ||
        report.observations.some(row => row.status !== 'DELIVERED')) process.exitCode = 1;
  }
} catch (e) {
  show({ state: 'HELD', reason: String(e?.message || 'field_cli_failed').slice(0, 140),
    field01b_qualified: false });
  process.exitCode = 1;
}
