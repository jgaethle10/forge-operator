import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {analyzeTimeSeriesEnergy} from './time-series-energy.mjs';
import {inspectTimeSeriesBundle} from './time-series-bundle.mjs';

const HEADER='tSeconds,voltageVolts,currentAmps,absolutePowerBoundWatts\n';

function channel(id, current, uncertainty=0.05) {
  return {id, samples:[0,1,2].map(tSeconds=>({
    tSeconds, voltageVolts:5, currentAmps:current, absolutePowerBoundWatts:uncertainty
  }))};
}
function measured() {
  return {dataKind:'measured', timebase:'synchronized_steady_dc_samples',
    sourceInventoryAttested:true, synchronizedSamplingAttested:true,
    sourceInventoryNote:'self-declared only; not a real experiment',
    operator:'TEST FIXTURE', rawSourceReference:'TEST FIXTURE', maxGapSeconds:1,
    inputSources:[channel('primary',1)], loadedOutput:channel('load',0.4)};
}
function fixture(t) {
  const rootDirectory=mkdtempSync(path.join(tmpdir(),'hist-tech-strict-'));
  t.after(()=>rmSync(rootDirectory,{recursive:true,force:true}));
  const input=HEADER+'0,5,1,0.05\n1,5,1,0.05\n2,5,1,0.05\n';
  const output=HEADER+'0,5,0.4,0.05\n1,5,0.4,0.05\n2,5,0.4,0.05\n';
  writeFileSync(path.join(rootDirectory,'input.csv'),input);
  writeFileSync(path.join(rootDirectory,'output.csv'),output);
  const manifest={
    schema:'evercraft.historical-tech.time-series-bundle.v1',
    sessionId:'SYNTHETIC-TEST-NOT-A-MEASUREMENT',
    dataKind:'synthetic', capturedAt:'2026-11-10T00:00:00Z',
    allInputsDeclared:true,synchronizationConfirmed:true,
    sourceInventoryNote:'fixture, no hardware', maxGapSeconds:1,
    channels:[
      {id:'input',role:'input',relativePath:'input.csv',
        sha256:createHash('sha256').update(input).digest('hex')},
      {id:'output',role:'loaded_output',relativePath:'output.csv',
        sha256:createHash('sha256').update(output).digest('hex')}
    ]};
  return {rootDirectory,manifest};
}
function mutateCSV(f,replacement) {
  const file=HEADER+'0,5,1,0.05\n1,'+replacement+',1,0.05\n2,5,1,0.05\n';
  writeFileSync(path.join(f.rootDirectory,'input.csv'),file);
  f.manifest.channels[0].sha256=createHash('sha256').update(file).digest('hex');
}

test('measured telemetry with positive declared sample bounds stays explicitly unauthenticated',()=>{
  const result=analyzeTimeSeriesEnergy(measured());
  assert.equal(result.apparentEnergyRatio,0.4);
  assert.equal(result.publicationAllowed,false);
  assert.equal(result.independentlyVerifiedCalibration,false);
});
test('alleged measured input cannot declare zero power uncertainty',()=>{
  const record=measured();
  record.inputSources[0].samples[1].absolutePowerBoundWatts=0;
  assert.throws(()=>analyzeTimeSeriesEnergy(record),/cannot claim zero power uncertainty/);
});
test('alleged measured loaded output cannot declare zero power uncertainty',()=>{
  const record=measured();
  record.loadedOutput.samples[2].absolutePowerBoundWatts=0;
  assert.throws(()=>analyzeTimeSeriesEnergy(record),/cannot claim zero power uncertainty/);
});
test('alleged measured auxiliary source cannot declare zero power uncertainty',()=>{
  const record=measured();
  record.inputSources.push(channel('auxiliary',0.1,0));
  assert.throws(()=>analyzeTimeSeriesEnergy(record),/cannot claim zero power uncertainty/);
});
test('zero-uncertainty synthetic fixtures remain eligible only for software tests',()=>{
  const record=measured(); record.dataKind='synthetic';
  record.inputSources[0].samples.forEach(s=>{s.absolutePowerBoundWatts=0});
  record.loadedOutput.samples.forEach(s=>{s.absolutePowerBoundWatts=0});
  const r=analyzeTimeSeriesEnergy(record);
  assert.equal(r.apparentEnergyRatio,0.4);
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.evidenceStatus,'synthetic_fixture_only');
});
test('hexadecimal disguised as instrument decimal CSV is refused',t=>{
  const f=fixture(t);mutateCSV(f,'0x10');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric/);
});
test('binary numeric forms and leading whitespace are refused',t=>{
  const f=fixture(t);mutateCSV(f,'0b101');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric/);
  mutateCSV(f,' 5');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric/);
});
test('underscore and dangling exponent CSV values fail closed',t=>{
  const f=fixture(t);mutateCSV(f,'1_000');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric/);
  mutateCSV(f,'5e');
  assert.throws(()=>inspectTimeSeriesBundle(f),/Strict decimal CSV numeric/);
});
test('decimal scientific notation remains accepted and result is labeled synthetic',t=>{
  const f=fixture(t);mutateCSV(f,'5.0e0');
  const r=inspectTimeSeriesBundle(f);
  assert.equal(r.analysis.totalInputEnergyJoules,10);
  assert.equal(r.dataKind,'synthetic');
  assert.equal(r.scientificClaimAuthorized,false);
});
