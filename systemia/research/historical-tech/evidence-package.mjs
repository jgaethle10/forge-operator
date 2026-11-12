/**
 * HIST-TECH-001: integrity gate for locally collected DC bench-data artifacts.
 * Does NOT establish that files came from real instruments or that any reported
 * physical measurement, safety approval, or calibration claim is authentic.
 */
import {createHash} from 'node:crypto';
import {readFileSync, lstatSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {evaluateBenchSession} from './bench-evaluator.mjs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UTC_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be nonempty text');
  return value;
}
function timestamp(value, label) {
  text(value, label);
  if (!UTC_DATE.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(label + ' must be an unambiguous ISO 8601 UTC timestamp');
  }
  return Date.parse(value);
}
function relativePath(value) {
  text(value, 'relativePath');
  const segments = value.split('/');
  if (path.isAbsolute(value) || value.includes('\\') || value.includes(':') ||
    segments.some(s => !s || s === '..' || s === '.')) {
    throw new Error('Raw artifact path must be a safe relative path');
  }
  return segments;
}
function readIntegrityCheckedFile(rootDirectory, relative) {
  const segments = relativePath(relative);
  const root = realpathSync(rootDirectory);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) throw new Error('Symlink not allowed in raw artifact path');
  }
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!current.startsWith(rootPrefix)) throw new Error('Raw artifact escaped evidence directory');
  const info = lstatSync(current);
  if (!info.isFile() || info.size < 1 || info.size > MAX_FILE_BYTES) {
    throw new Error('Raw artifact must be a nonempty file not exceeding 5 MiB');
  }
  return createHash('sha256').update(readFileSync(current)).digest('hex');
}

export function inspectEvidencePackage({session, manifest, rootDirectory}) {
  if (!session || !manifest || typeof manifest !== 'object') throw new Error('Session and manifest are required');
  if (session.dataKind !== 'measured' || manifest.dataKind !== 'measured') {
    throw new Error('This intake only accepts alleged measured data; synthetic fixtures are not evidence');
  }
  if (manifest.schema !== 'evercraft.historical-tech.evidence-manifest.v1') {
    throw new Error('Unsupported evidence manifest schema');
  }
  if (text(manifest.sessionId, 'manifest.sessionId') !== text(session.sessionId, 'session.sessionId')) {
    throw new Error('Manifest/session ID mismatch');
  }
  if (timestamp(manifest.capturedAt, 'manifest.capturedAt') <= 0) throw new Error('Invalid capture date');
  if (typeof rootDirectory !== 'string' || !path.isAbsolute(rootDirectory)) {
    throw new Error('rootDirectory must be an absolute path for explicit evidence scoping');
  }
  const safety = manifest.safetyApproval;
  if (!safety) throw new Error('Safety approval metadata required');
  text(safety.approver, 'safetyApproval.approver');
  text(safety.recordRef, 'safetyApproval.recordRef');
  if (timestamp(safety.approvedAt, 'safetyApproval.approvedAt') > timestamp(manifest.capturedAt, 'manifest.capturedAt')) {
    throw new Error('Safety approval time cannot follow claimed data acquisition');
  }
  if (!Array.isArray(manifest.instruments) || manifest.instruments.length !== 2) {
    throw new Error('Require separate input and loaded-output DC instrument records');
  }
  const roles = new Set();
  for (const instrument of manifest.instruments) {
    if (!instrument || !['dc_input', 'dc_loaded_output'].includes(instrument.role) || roles.has(instrument.role)) {
      throw new Error('Instrument roles must be unique: dc_input and dc_loaded_output');
    }
    roles.add(instrument.role);
    for (const field of ['manufacturer','model','serial','calibrationRecordRef']) text(instrument[field], field);
    const due = timestamp(instrument.calibrationValidUntil, 'calibrationValidUntil');
    if (due < timestamp(manifest.capturedAt, 'manifest.capturedAt')) {
      throw new Error('Calibration metadata expired at claimed acquisition date');
    }
  }
  if (!Array.isArray(manifest.rawFiles) || manifest.rawFiles.length !== session.trials?.length) {
    throw new Error('Require one hashed raw artifact for each trial');
  }
  const filesByTrial = new Map();
  const paths = new Set();
  for (const file of manifest.rawFiles) {
    if (!file) throw new Error('Invalid artifact record');
    text(file.trialId, 'rawFiles.trialId');
    if (filesByTrial.has(file.trialId)) throw new Error('Duplicate raw artifact trial ID');
    relativePath(file.relativePath);
    if (paths.has(file.relativePath)) throw new Error('Raw artifact path reused for multiple trials');
    if (!SHA256.test(file.sha256)) throw new Error('Require lowercase SHA-256 digest for raw artifact');
    filesByTrial.set(file.trialId,file);
    paths.add(file.relativePath);
  }
  const report = evaluateBenchSession(session);
  const integrityChecks = [];
  for (const trial of session.trials) {
    const record = filesByTrial.get(trial.trialId);
    if (!record || trial.rawMeasurementRef !== record.relativePath) {
      throw new Error('Missing or unbound raw artifact for trial ' + trial.trialId);
    }
    const actual = readIntegrityCheckedFile(rootDirectory, record.relativePath);
    if (actual !== record.sha256) throw new Error('Raw artifact SHA-256 mismatch for ' + trial.trialId);
    integrityChecks.push({trialId:trial.trialId, sha256:actual, bytesChecked:true});
  }
  return {
    sessionId:session.sessionId,
    dataKind:'measured',
    status:'raw_bytes_match_self_declared_manifest',
    filesChecked:integrityChecks.length,
    checks:integrityChecks,
    minimumDesignChecksPassed:report.experimentalDesignComplete,
    designLimitations:report.limitations,
    externalMeasurementAuthentication:false,
    instrumentCalibrationIndependentlyVerified:false,
    safetyApprovalIndependentlyVerified:false,
    publicationAllowed:false,
    scientificClaimAuthorized:false,
    explanation:'Checks only local byte integrity, metadata format and the basic DC session design. Hashes, signatures, calibration, approvers and instrument origin are not independently authenticated. Never infer real physical performance from this result.'
  };
}
