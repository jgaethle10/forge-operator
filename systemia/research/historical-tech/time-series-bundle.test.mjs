import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectTimeSeriesBundle} from './time-series-bundle.mjs';

const HDR='tSeconds,voltageVolts,currentAmps,absolutePowerBoundWatts\n';
function makeCSV(amps=1,times=[0,1,2]) {
  return HDR+times.map(t=>t+',5,'+amps+',0.05').join('\n')+'\n';
}
function fixture(t) {
  const rootDirectory=mkdtempSync(path.join(tmpdir(),'hist-tech-series-'));
  t.after(()=>rmSync(rootDirectory,{recursive:true,force:true}));
  const channels=[
    {id:'dc_source_1',role:'input',relativePath:'input.csv',content:makeCSV(1)},
    {id:'loaded_output_1',role:'loaded_output',relativePath:'output.csv',content:makeCSV(0.4)}
  ];
  for(const c of channels) writeFileSync(path.join(rootDirectory,c.relativePath),c.content);
  const manifest={
    schema:'evercraft.historical-tech.time-series-bundle.v1',
    sessionId:'SYNTHETIC-TEST-ONLY-001',dataKind:'synthetic',
    capturedAt:'2026-11-09T22:00:00Z',
    allInputsDeclared:true,synchronizationConfirmed:true,
    sourceInventoryNote:'Completely invented readings; source and timebase attestations are illustrative',
    maxGapSeconds:1,
    channels:channels.map(({id,role,relativePath,content})=>({
      id,role,relativePath,sha256:createHash('sha256').update(content).digest('hex')
    }))
  };
  return {rootDirectory,manifest};
}
function rewrite(f,id,data) {
  const rec=f.manifest.channels.find(ch=>ch.id===id);
  writeFileSync(path.join(f.rootDirectory,rec.relativePath),data);
  rec.sha256=createHash('sha256').update(data).digest('hex');
}
function allegedMeasured(f) {
  f.manifest.dataKind='measured';
  f.manifest.operator='fixture fake person';
  f.manifest.rawSourceReference='NOT-A-REAL-DEVICE';
  f.manifest.safetyApproval={approver:'fixture fake',recordRef:'no verified signature',
    approvedAt:'2026-11-09T21:00:00Z'};
  for (const c of f.manifest.channels) Object.assign(c,{
    instrumentManufacturer:'fixture only',instrumentModel:'fixture only',
    instrumentSerial:c.id,calibrationRecordRef:'NOT-VERIFIED',
    calibrationValidUntil:'2027-11-09T00:00:00Z'
  });
}
test('hash-bound synthetic CSV flows end-to-end to 10 J input and 4 J load',t=>{
  const f=fixture(t),r=inspectTimeSeriesBundle(f);
  assert.equal(r.checkedFiles.length,2);
  assert.equal(r.analysis.totalInputEnergyJoules,10);
  assert.equal(r.analysis.loadedOutputEnergyJoules,4);
  assert.equal(r.analysis.apparentEnergyRatio,0.4);
  assert.equal(r.analysis.evidenceStatus,'synthetic_fixture_only');
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.scientificClaimAuthorized,false);
});
test('an alleged measured run remains independently unverified and blocked',t=>{
  const f=fixture(t); allegedMeasured(f);
  const r=inspectTimeSeriesBundle(f);
  assert.equal(r.dataKind,'measured');
  assert.equal(r.analysis.evidenceStatus,'self_declared_measurement_not_authenticated');
  assert.equal(r.physicalCaptureVerified,false);
  assert.equal(r.externalInstrumentAuthentication,false);
  assert.equal(r.publicationAllowed,false);
});
test('tampering a raw CSV after creating hash causes hard failure',t=>{
  const f=fixture(t);
  writeFileSync(path.join(f.rootDirectory,'input.csv'),makeCSV(2));
  assert.throws(()=>inspectTimeSeriesBundle(f),/SHA-256 mismatch/);
});
test('dot-dot traversal path is rejected',t=>{
  const f=fixture(t);
  f.manifest.channels[0].relativePath='../input.csv';
  assert.throws(()=>inspectTimeSeriesBundle(f),/Unsafe relative/);
});
test('symlink to file inside root is rejected',t=>{
  const f=fixture(t);
  symlinkSync(path.join(f.rootDirectory,'input.csv'),path.join(f.rootDirectory,'link.csv'));
  f.manifest.channels[0].relativePath='link.csv';
  assert.throws(()=>inspectTimeSeriesBundle(f),/symlink forbidden/);
});
test('duplicate file paths are rejected even when input IDs differ',t=>{
  const f=fixture(t);
  f.manifest.channels[1].relativePath='input.csv';
  assert.throws(()=>inspectTimeSeriesBundle(f),/Duplicate raw-data path/);
});
test('duplicate channel IDs are rejected',t=>{
  const f=fixture(t);
  f.manifest.channels[1].id='dc_source_1';
  assert.throws(()=>inspectTimeSeriesBundle(f),/Duplicate channel ID/);
});
test('two loaded outputs are rejected rather than silently compared',t=>{
  const f=fixture(t);
  f.manifest.channels[0].role='loaded_output';
  assert.throws(()=>inspectTimeSeriesBundle(f),/Exactly one loaded output/);
});
test('mismatched capture times do not get interpolated into apparent power',t=>{
  const f=fixture(t);
  rewrite(f,'loaded_output_1',makeCSV(0.4,[0,0.9,2]));
  assert.throws(()=>inspectTimeSeriesBundle(f),/exactly synchronized/);
});
test('missing raw data column fails before numerical analysis',t=>{
  const f=fixture(t);
  rewrite(f,'dc_source_1','tSeconds,voltageVolts,currentAmps\n0,5,1\n1,5,1\n2,5,1\n');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Exact CSV header required/);
});
test('nonfinite CSV measurements are rejected',t=>{
  const f=fixture(t);
  rewrite(f,'dc_source_1',HDR+'0,5,1,0.05\n1,Infinity,1,0.05\n2,5,1,0.05\n');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric|Nonfinite numeric/);
});
test('missing input completeness attestation fails closed',t=>{
  const f=fixture(t);
  f.manifest.allInputsDeclared=false;
  assert.throws(()=>inspectTimeSeriesBundle(f),/must be explicitly self-attested/);
});
test('fake calibration validity and later safety signoff are rejected',t=>{
  const f=fixture(t);allegedMeasured(f);
  f.manifest.channels[0].calibrationValidUntil='2026-11-08T00:00:00Z';
  assert.throws(()=>inspectTimeSeriesBundle(f),/calibration expired/);
  f.manifest.channels[0].calibrationValidUntil='2027-11-09T00:00:00Z';
  f.manifest.safetyApproval.approvedAt='2026-11-10T00:00:00Z';
  assert.throws(()=>inspectTimeSeriesBundle(f),/approval follows capture/);
});
test('unexplained output gain is labeled an anomaly, never science authorization',t=>{
  const f=fixture(t);
  rewrite(f,'loaded_output_1',makeCSV(2));
  const r=inspectTimeSeriesBundle(f);
  assert.equal(r.analysis.classification,'apparent_anomaly_requires_independent_investigation');
  assert.equal(r.scientificClaimAuthorized,false);
});
test('an auxiliary power supply must count toward total input',t=>{
  const f=fixture(t),content=makeCSV(0.5);
  writeFileSync(path.join(f.rootDirectory,'aux.csv'),content);
  f.manifest.channels.push({role:'input',id:'aux',relativePath:'aux.csv',
    sha256:createHash('sha256').update(content).digest('hex')});
  const r=inspectTimeSeriesBundle(f);
  assert.equal(r.analysis.enumeratedInputSourceCount,2);
  assert.equal(r.analysis.totalInputEnergyJoules,15);
  assert.equal(r.analysis.apparentEnergyRatio,4/15);
});
test('CLI reads fixture without mutating evidence directory or publishing data',t=>{
  const f=fixture(t);
  const filename=path.join(f.rootDirectory,'manifest.json');
  writeFileSync(filename,JSON.stringify(f.manifest));
  const script=fileURLToPath(new URL('./time-series-bundle.mjs',import.meta.url));
  const data=JSON.parse(execFileSync(process.execPath,[script,f.rootDirectory,filename],{encoding:'utf8'}));
  assert.equal(data.checkedFiles.length,2);
  assert.equal(data.publicationAllowed,false);
});
