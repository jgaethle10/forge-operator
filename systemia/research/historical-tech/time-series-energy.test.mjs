import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTimeSeriesEnergy} from './time-series-energy.mjs';

function channel(id, volts=[5,5,5], amps=[1,1,1], bound=0.05, times=[0,1,2]) {
  return {id, samples:times.map((tSeconds,i)=>({
    tSeconds, voltageVolts:volts[i], currentAmps:amps[i], absolutePowerBoundWatts:bound
  }))};
}
function fixture() {
  return {dataKind:'synthetic',timebase:'synchronized_steady_dc_samples',
    sourceInventoryAttested:true, synchronizedSamplingAttested:true,
    sourceInventoryNote:'Invented sources; no physical equipment',
    maxGapSeconds:1,
    inputSources:[channel('primary')],
    loadedOutput:channel('load',[5,5,5],[0.4,0.4,0.4])};
}

test('steady DC series integrates samplewise power to joules',()=>{
  const r=analyzeTimeSeriesEnergy(fixture());
  assert.equal(r.totalInputEnergyJoules,10);
  assert.equal(r.loadedOutputEnergyJoules,4);
  assert.equal(r.apparentEnergyRatio,0.4);
  assert.equal(r.durationSeconds,2);
  assert.equal(r.sampleCount,3);
  assert.deepEqual(r.apparentEnergyRatioBound,[3.9/10.1,4.1/9.9]);
});

test('voltage-current covariance defeats product of separate averages',()=>{
  const f=fixture();
  f.loadedOutput=channel('load',[1,2,3],[3,2,1]);
  const r=analyzeTimeSeriesEnergy(f);
  assert.equal(r.loadedOutputEnergyJoules,7); // Integrates [3,4,3] W, not 4 W * 2 s
  assert.equal(r.apparentEnergyRatio,0.7);
  assert.notEqual(r.loadedOutputEnergyJoules,8);
});

test('enumerated auxiliary DC input is included in denominator',()=>{
  const f=fixture();
  f.inputSources.push(channel('aux',[5,5,5],[0.5,0.5,0.5]));
  const r=analyzeTimeSeriesEnergy(f);
  assert.equal(r.enumeratedInputSourceCount,2);
  assert.equal(r.totalInputEnergyJoules,15);
  assert.equal(r.apparentEnergyRatio,4/15);
});

test('declared >100% is flagged for investigation, not treated as a breakthrough',()=>{
  const f=fixture();
  f.loadedOutput=channel('load',[5,5,5],[2,2,2]);
  const r=analyzeTimeSeriesEnergy(f);
  assert.equal(r.classification,'apparent_anomaly_requires_independent_investigation');
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.scientificClaimAuthorized,false);
});

test('uncertainty overlapping 100% prevents an unambiguous anomaly label',()=>{
  const f=fixture();
  f.loadedOutput=channel('load',[5,5,5],[1.01,1.01,1.01],0.2);
  const r=analyzeTimeSeriesEnergy(f);
  assert.equal(r.classification,'apparent_gain_within_declared_bounds');
  assert.ok(r.apparentEnergyRatioBound[0]<1);
  assert.equal(r.publicationAllowed,false);
});

test('mismatched timestamps are rejected instead of interpolation or quiet alignment',()=>{
  const f=fixture();
  f.loadedOutput=channel('load',[5,5,5],[0.4,0.4,0.4],0.05,[0,0.5,2]);
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/exactly synchronized/);
});

test('nonmonotonic timestamps and unapproved sampling gaps are rejected',()=>{
  const f=fixture(); f.inputSources[0]=channel('primary',[5,5,5],[1,1,1],0.05,[0,0,1]);
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/nonincreasing/);
  const g=fixture(); g.maxGapSeconds=0.5;
  assert.throws(()=>analyzeTimeSeriesEnergy(g),/sampling gap/);
});

test('negative sample and nonfinite input cannot be treated as unidirectional DC',()=>{
  const f=fixture();f.loadedOutput.samples[1].currentAmps=-0.2;
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/nonnegative/);
  const g=fixture();g.inputSources[0].samples[0].voltageVolts=NaN;
  assert.throws(()=>analyzeTimeSeriesEnergy(g),/finite/);
});

test('unsynchronized or AC/RF signals are rejected by scope gate',()=>{
  const f=fixture();f.timebase='asynchronous_rms_AC';
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/Only simultaneously sampled/);
  const g=fixture();g.synchronizedSamplingAttested=false;
  assert.throws(()=>analyzeTimeSeriesEnergy(g),/explicitly attested/);
});

test('unattested source inventory and duplicate source IDs fail',()=>{
  const f=fixture();f.sourceInventoryAttested=false;
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/explicitly attested/);
  const g=fixture();g.inputSources.push(channel('primary'));
  assert.throws(()=>analyzeTimeSeriesEnergy(g),/Duplicate input source ID/);
});

test('self-declared measured telemetry is never independently authenticated',()=>{
  const f=fixture();f.dataKind='measured'; f.rawSourceReference='fake://not-verified';f.operator='fixture-only';
  const r=analyzeTimeSeriesEnergy(f);
  assert.equal(r.evidenceStatus,'self_declared_measurement_not_authenticated');
  assert.equal(r.independentlyVerifiedInputInventory,false);
  assert.equal(r.independentlyVerifiedTimebase,false);
  assert.equal(r.independentlyVerifiedCalibration,false);
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.scientificClaimAuthorized,false);
});

test('measured telemetry requires raw provenance metadata but does not certify it',()=>{
  const f=fixture();f.dataKind='measured';
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/rawSourceReference/);
  f.rawSourceReference='self-declared';assert.throws(()=>analyzeTimeSeriesEnergy(f),/operator/);
});

test('rejects uncertainty larger than source input energy',()=>{
  const f=fixture(); f.inputSources[0].samples.forEach(s=>{s.absolutePowerBoundWatts=6});
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/no positive energy lower bound/);
});

test('rejects output labeled with the same ID as a source',()=>{
  const f=fixture();f.loadedOutput.id='primary';
  assert.throws(()=>analyzeTimeSeriesEnergy(f),/overlaps an input source/);
});

test('synthetic results must remain explicitly synthetic and nonpublishable',()=>{
  const r=analyzeTimeSeriesEnergy(fixture());
  assert.equal(r.evidenceStatus,'synthetic_fixture_only');
  assert.equal(r.publicationAllowed,false);
  assert.match(r.limitations,/AC\/RF ripple/);
});
