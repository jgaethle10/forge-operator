import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectEvidencePackage} from './evidence-package.mjs';

function fixture(t) {
  const rootDirectory = mkdtempSync(path.join(tmpdir(), 'hist-tech-001-'));
  t.after(()=>rmSync(rootDirectory,{recursive:true,force:true}));
  const records = [['A1','aligned',0,0.15],['A2','aligned',0,0.15],
    ['A3','aligned',0,0.15],['M1','misaligned',90,0.03],
    ['Z1','receiver_absent',0,0]];
  const trials = records.map(([id,condition,angle,amps])=>({
    trialId:id,condition, distanceMm:20, orientationDegrees:angle,
    inputVolts:5,inputAmps:0.5,outputVolts:condition==='receiver_absent'?0:5,
    outputAmps:amps,durationSeconds:30,
    inputUncertaintyWatts:0.1,outputUncertaintyWatts:0.05,
    rawMeasurementRef:id+'.csv'
  }));
  const session = {sessionId:'MEASURED-METADATA-ONLY-001',dataKind:'measured',
    operator:'not a verified person',instrumentTraceability:'not a verified certificate',
    safetyReviewRecorded:true,
    inputMeasurement:'dc_source_voltage_and_current',
    outputMeasurement:'dc_loaded_voltage_and_current',trials};
  const rawFiles = trials.map(trial=>{
    const relativePath = trial.rawMeasurementRef;
    const bytes = Buffer.from('fixture only,not laboratory evidence\n'+trial.trialId+',0,0\n');
    writeFileSync(path.join(rootDirectory,relativePath),bytes);
    return {trialId:trial.trialId,relativePath,sha256:createHash('sha256').update(bytes).digest('hex')};
  });
  const instruments = ['dc_input','dc_loaded_output'].map(role=>({
    role,manufacturer:'fixture manufacturer',model:'fixture model',serial:role,
    calibrationRecordRef:'UNVERIFIED-FIXTURE-REFERENCE',
    calibrationValidUntil:'2027-12-01T00:00:00Z'
  }));
  const manifest = {schema:'evercraft.historical-tech.evidence-manifest.v1',
    sessionId:session.sessionId,dataKind:'measured',capturedAt:'2026-11-09T12:00:00Z',
    safetyApproval:{approver:'fixture-only name',recordRef:'UNVERIFIED-FIXTURE-REFERENCE',
      approvedAt:'2026-11-09T11:00:00Z'}, instruments,rawFiles};
  return {rootDirectory,session,manifest};
}

test('checks raw file bytes and makes NO physical-authentication or publication claim',t=>{
  const f=fixture(t),v=inspectEvidencePackage(f);
  assert.equal(v.filesChecked,5);
  assert.equal(v.minimumDesignChecksPassed,true);
  assert.equal(v.status,'raw_bytes_match_self_declared_manifest');
  assert.equal(v.externalMeasurementAuthentication,false);
  assert.equal(v.instrumentCalibrationIndependentlyVerified,false);
  assert.equal(v.safetyApprovalIndependentlyVerified,false);
  assert.equal(v.publicationAllowed,false);
  assert.equal(v.scientificClaimAuthorized,false);
});

test('tampered bytes fail SHA-256 intake',t=>{
  const f=fixture(t);
  writeFileSync(path.join(f.rootDirectory,'A1.csv'),'tampered');
  assert.throws(()=>inspectEvidencePackage(f),/SHA-256 mismatch/);
});

test('path traversal is rejected even when a self-declared hash exists',t=>{
  const f=fixture(t);
  f.manifest.rawFiles[0].relativePath='../outside.csv';
  f.session.trials[0].rawMeasurementRef='../outside.csv';
  assert.throws(()=>inspectEvidencePackage(f),/safe relative path/);
});

test('symlink raw artifacts are rejected even if they resolve within the root',t=>{
  const f=fixture(t);
  symlinkSync(path.join(f.rootDirectory,'A1.csv'),path.join(f.rootDirectory,'A1-link.csv'));
  f.manifest.rawFiles[0].relativePath='A1-link.csv';
  f.session.trials[0].rawMeasurementRef='A1-link.csv';
  assert.throws(()=>inspectEvidencePackage(f),/Symlink not allowed/);
});

test('rejects stale instrument calibration metadata',t=>{
  const f=fixture(t);
  f.manifest.instruments[1].calibrationValidUntil='2026-11-08T00:00:00Z';
  assert.throws(()=>inspectEvidencePackage(f),/Calibration metadata expired/);
});

test('rejects missing safety metadata or approval later than measurement',t=>{
  const f=fixture(t);
  f.manifest.safetyApproval=null;
  assert.throws(()=>inspectEvidencePackage(f),/Safety approval metadata/);
  f.manifest.safetyApproval={approver:'fixture',recordRef:'fixture',approvedAt:'2026-11-10T00:00:00Z'};
  assert.throws(()=>inspectEvidencePackage(f),/approval time cannot follow/);
});

test('rejects unbound raw files and duplicate raw trial identities',t=>{
  const f=fixture(t);
  f.session.trials[0].rawMeasurementRef='wrong.csv';
  assert.throws(()=>inspectEvidencePackage(f),/Missing or unbound/);
  f.session.trials[0].rawMeasurementRef='A1.csv';
  f.manifest.rawFiles[1].trialId='A1';
  assert.throws(()=>inspectEvidencePackage(f),/Duplicate raw artifact trial ID/);
});

test('rejects synthetic fixtures passed through a measured-data intake',t=>{
  const f=fixture(t);
  f.session.dataKind='synthetic';
  assert.throws(()=>inspectEvidencePackage(f),/synthetic fixtures are not evidence/);
});

test('rejects instrument records without both independent roles',t=>{
  const f=fixture(t);
  f.manifest.instruments[1].role='dc_input';
  assert.throws(()=>inspectEvidencePackage(f),/Instrument roles must be unique/);
});

test('missing negative controls remain explicitly failed despite intact raw bytes',t=>{
  const f=fixture(t);
  f.session.trials=f.session.trials.filter(v=>v.condition!=='receiver_absent');
  f.manifest.rawFiles=f.manifest.rawFiles.filter(v=>v.trialId!=='Z1');
  const result=inspectEvidencePackage(f);
  assert.equal(result.filesChecked,4);
  assert.equal(result.minimumDesignChecksPassed,false);
  assert.ok(result.designLimitations.some(s=>s.includes('receiver-absent')));
  assert.equal(result.publicationAllowed,false);
});
