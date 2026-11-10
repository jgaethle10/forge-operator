import fs from 'node:fs';
import path from 'node:path';

// Fail-closed local clock rollback detector, not an independently trusted time source.
// The state directory must be operator-owned, non-symlink, private and persistent.
const MAX_CLOCK_SKEW_MS = 1000;
const validTime = (value) => {
  const ts = value instanceof Date ? value.getTime() : (typeof value === 'string' ? Date.parse(value) : NaN);
  if (!Number.isSafeInteger(ts) || ts < 0) throw Error('clock_guard_invalid_time');
  return ts;
};
const checkDir = (dir) => {
  if (!path.isAbsolute(dir)) throw Error('clock_guard_absolute_state_dir_required');
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) {
    throw Error('clock_guard_private_directory_required');
  }
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw Error('clock_guard_owner_mismatch');
};
function readMark(filename) {
  const st = fs.lstatSync(filename);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || st.size > 256 || st.size < 10) {
    throw Error('clock_guard_state_permissions_or_shape_invalid');
  }
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw Error('clock_guard_owner_mismatch');
  const x = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (x?.schema !== 'evercraft.radio.clock-highwater.v1' || !Number.isSafeInteger(x?.highest_seen_utc_ms) || x.highest_seen_utc_ms < 0) {
    throw Error('clock_guard_state_corrupt');
  }
  return x.highest_seen_utc_ms;
}
function writeMark(filename, value) {
  const name = filename + '.' + process.pid + '.' + Math.random().toString(16).slice(2) + '.tmp';
  const payload = JSON.stringify({ schema: 'evercraft.radio.clock-highwater.v1', highest_seen_utc_ms: value }) + '\n';
  try {
    const fd = fs.openSync(name, 'wx', 0o600);
    try { fs.writeFileSync(fd, payload); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(name, filename);
  } finally { try { fs.unlinkSync(name); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
}
export function createCommunityRadioClockGuard({stateDir,initialize=false,now=new Date()}={}) {
  checkDir(stateDir);
  const file = path.join(stateDir, 'radio-clock-highwater.json');
  if (!fs.existsSync(file)) {
    if (!initialize) throw Error('clock_guard_state_missing_reenrollment_required');
    writeMark(file, validTime(now));
  }
  // Require the state to have been persisted before serving any bytes.
  let previous = readMark(file);
  const observe = (when = new Date()) => {
    checkDir(stateDir);
    const observed = validTime(when);
    const persisted = readMark(file);
    if (persisted < previous) throw Error('clock_guard_state_rolled_back');
    if (observed + MAX_CLOCK_SKEW_MS < persisted) throw Error('clock_guard_wall_clock_rollback');
    if (observed > persisted) {
      writeMark(file, observed);
      previous = readMark(file);
    } else previous = persisted;
    return {state:'clock_nonrollback_observed',observed_utc_ms:observed,highest_seen_utc_ms:previous};
  };
  observe(now);
  return {observe, state_file:file, trust:'operator_owned_local_highwater_only_not_secure_time'};
}
