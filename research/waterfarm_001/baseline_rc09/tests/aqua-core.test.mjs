import test from 'node:test';
import assert from 'node:assert/strict';
import {COLUMNS,auditCSV,syntheticSample,EvidenceHold,outputJSON} from '../app/core.mjs';
const original=syntheticSample();
function swap(row,key,value){const lines=original.trim().split('\n');let pos=COLUMNS.indexOf(key);let cells=lines[row].split(',');cells[pos]=value;lines[row]=cells.join(',');return lines.join('\n')+'\n'}
test('14-day example yields clear UNVERIFIED indicators, no savings',()=>{
 const r=auditCSV(original);
 assert.equal(r.source_inlet_l,14000);assert.equal(r.irrigation_meter_l,13300);
 assert.equal(r.pump_energy_kwh,84);assert.equal(r.energy_kwh_per_source_m3,6);
 assert.equal(r.apparent_imbalance_l,null);assert.equal(r.authorized_to_claim_leak,false);
 assert.equal(r.authorized_to_claim_savings,false);assert.equal(r.days_data.length,14)
});
test('operator scope attestation still does not establish physical truth',()=>{
 const r=auditCSV(original,{scopeReviewed:true});assert.equal(r.apparent_imbalance_l,700);
 assert.equal(r.difference_outside_uncertainty_l,280);assert.equal(r.authorized_to_claim_leak,false);
 assert.match(r.imbalance_status,/INDEPENDENT_REVIEW_REQUIRED/)
});
test('13 days fail',()=>assert.throws(()=>auditCSV(original.trim().split('\n').slice(0,-1).join('\n')),EvidenceHold));
test('zero volume gives null energy intensity',()=>{let txt=original.trim().split('\n');for(let i=1;i<txt.length;i++){const c=txt[i].split(',');for(let k of [2,3,5,6])c[k]='0';txt[i]=c.join(',')}assert.equal(auditCSV(txt.join('\n')).energy_kwh_per_source_m3,null)});
test('gap fails',()=>assert.throws(()=>auditCSV(swap(2,'date','2025-01-04')),/duplicate or out-of-order|missing/));
test('missing is not zero',()=>assert.throws(()=>auditCSV(swap(2,'pump_kwh','')),EvidenceHold));
test('NaN/Inf/negative blocked',()=>{for(const x of ['NaN','Inf','Infinity','-1','1e500'])assert.throws(()=>auditCSV(swap(2,'source_close_l',x)),EvidenceHold)});
test('negative totalizer delta blocked',()=>assert.throws(()=>auditCSV(swap(2,'source_close_l','500')),EvidenceHold));
test('meter continuity fail',()=>assert.throws(()=>auditCSV(swap(2,'source_open_l','500')),EvidenceHold));
test('meter identity changed fail',()=>assert.throws(()=>auditCSV(swap(2,'source_meter_id','X')),EvidenceHold));
test('same meter inlet and irrigation fail',()=>assert.throws(()=>auditCSV(swap(2,'irrigation_meter_id','SYNTHETIC_SOURCE')),EvidenceHold));
test('bad observation kind fail',()=>assert.throws(()=>auditCSV(swap(2,'observation_kind','MODELED')),EvidenceHold));
test('invalid date fail',()=>assert.throws(()=>auditCSV(swap(2,'date','2025-02-30')),EvidenceHold));
test('malformed CSV fails',()=>assert.throws(()=>auditCSV(original.replace(COLUMNS.join(','),'date,volume')),EvidenceHold));
test('uncertainty high -> 0 outside envelope not savings',()=>{const r=auditCSV(swap(2,'source_uncertainty_l','1000'),{scopeReviewed:true});assert.equal(r.difference_outside_uncertainty_l,0)});
test('can parse quoted calibration with embedded comma',()=>{let txt=original.replace('FICTIONAL_CALIBRATION','"FICTIONAL,CALIBRATION"');assert.equal(auditCSV(txt).days,14)});
test('client JSON serializable without readings IDs',()=>{const r=auditCSV(original);const j=outputJSON(r);assert.equal(JSON.parse(j).source_inlet_l,14000);assert.doesNotMatch(j,/calibration_ref/)});
test('rejects oversize input',()=>assert.throws(()=>auditCSV('x'.repeat(2_000_001)),EvidenceHold));