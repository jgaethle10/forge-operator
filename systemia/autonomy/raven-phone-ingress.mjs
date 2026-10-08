// Staged owned HTTP intake for Raven's existing signed communications bridge.
// This does not send messages, admit a mission, or claim a real Twilio/provider event.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { verifyRavenPhoneBridge, planRavenPhoneDemand } from './raven-phone-demand.mjs';

const ROUTE = '/api/communications/raven-inbound';
const MAX_BODY = 65536;
const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
};
async function readRaw(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function prepareStore(dir) {
  if (!path.isAbsolute(dir)) throw new Error('private_absolute_state_dir_required');
  const resolved = path.resolve(dir);
  const repoRoot = path.resolve(process.cwd());
  if (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep)) {
    throw new Error('phone_state_cannot_be_inside_repository');
  }
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077)) {
    throw new Error('private_phone_store_permissions_invalid');
  }
  return resolved;
}
function persistCandidate(stateDir, candidate) {
  // Construct the complete private record before making the final event key visible.
  // A crash during a previous 'wx' write must never turn a truncated file into a false duplicate.
  const id = candidate.event_key.slice('raven:event:'.length);
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('event_key_invalid');
  const file = path.join(stateDir, id + '.json');
  const temp = path.join(stateDir, '.' + id + '.' + randomBytes(12).toString('hex') + '.tmp');
  let fd = null;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(candidate) + '\n', { encoding: 'utf8' });
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    try {
      // Atomic no-replace publication: concurrent workers cannot overwrite the same key.
      fs.linkSync(temp, file);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) {
        throw new Error('existing_event_record_not_private');
      }
      let previous;
      try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch { throw new Error('existing_event_record_corrupt'); }
      if (previous?.event_key !== candidate.event_key || previous?.schema !== candidate.schema) {
        throw new Error('existing_event_record_collision');
      }
      return { state: 'existing_review_candidate', duplicate: true };
    }
    // Make the directory entry durable, not just the file contents.
    const dirFd = fs.openSync(stateDir, fs.constants.O_RDONLY);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    return { state: 'review_candidate_persisted', duplicate: false };
  } finally {
    if (fd !== null) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch {}
  }
}
export function createRavenPhoneIngress({ secret = '', stateDir = '', now = () => new Date() } = {}) {
  const ready = typeof secret === 'string' && secret.length >= 32 &&
    typeof stateDir === 'string' && !!stateDir.trim();
  return Object.freeze({
    path: ROUTE,
    ready,
    state: ready ? 'configured_not_externally_verified' : 'disabled',
    async handle(req, res) {
      if (req.url !== ROUTE) return false;
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' }), true;
      if (!ready) return json(res, 503, { ok: false, error: 'private_ingress_disabled' }), true;
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return json(res, 415, { ok: false, error: 'unsupported_content_type' }), true;
      }
      let raw;
      try { raw = await readRaw(req); }
      catch {
        return json(res, 413, { ok: false, error: 'request_invalid_or_too_large' }), true;
      }
      let candidate;
      try {
        const envelope = verifyRavenPhoneBridge({
          rawBody: raw,
          timestamp: req.headers['x-evercraft-timestamp'],
          signature: req.headers['x-evercraft-signature'],
          secret, now: now(),
        });
        candidate = planRavenPhoneDemand(envelope);
      } catch {
        return json(res, 401, { ok: false, error: 'bridge_authentication_or_contract_failed' }), true;
      }
      try {
        const location = prepareStore(stateDir);
        const receipt = persistCandidate(location, candidate);
        json(res, receipt.duplicate ? 200 : 202, {
          ok: true,
          status: receipt.duplicate ? 'duplicate' : 'written',
          review_state: receipt.state,
          bridge_receipt_key: candidate.event_key,
          provider_verified: false,
          systemia_mission_admitted: false,
          customer_contact_authorized: false,
          payment_verified: false,
        });
      } catch {
        json(res, 503, { ok: false, error: 'durable_review_store_unavailable' });
      }
      return true;
    },
  });
}
