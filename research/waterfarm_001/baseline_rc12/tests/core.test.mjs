import test from 'node:test';import assert from 'node:assert/strict';
import {FIELDS,analyzeSingleMeter,demoCSV,templateCSV,sha256Hex,EvidenceHold} from '../app/core.mjs';
function rows(n=15,{unit='L',start=1000,step=1000,energy='5'}={}){const a=[FIELDS.join(',')];for(let i=0;i<n;i++)a.push(`2025-01-${String(i+1).padStart(2,'0')},SOURCE_001,${start+i*step},${unit},${i?energy:''},OPERATOR_SUPPLIED_READING`);return a.join('\n')+'\n';}
function change(s,what,to){return s.replace(what,to)}
test('14-day operator baseline: total volume energy, honest evidence',()=>{const a=analyzeSingleMeter(rows());assert.equal(a.interval_count,14);assert.equal(a.total_source_withdrawal_l,14000);assert.equal(a.energy_kwh_per_m3,5);assert.equal(a.leak_verified,false);assert.equal(a.water_savings_verified,false);assert.equal(a.evidence_state,'OPERATOR_SUPPLIED_UNVERIFIED')});
test('US gallons converted exactly',()=>assert.equal(analyzeSingleMeter(rows(15,{unit:'US_GAL',step:100})).total_source_withdrawal_l,5299.576));
test('M3 converted exactly',()=>assert.equal(analyzeSingleMeter(rows(15,{unit:'M3',step:1})).total_source_withdrawal_l,14000));
test('missing energy means unknown not zero',()=>{const a=analyzeSingleMeter(rows(15,{energy:''}));assert.equal(a.pump_energy_kwh,null);assert.equal(a.energy_intervals_missing,14)});
test('measured zero energy is zero',()=>assert.equal(analyzeSingleMeter(rows(15,{energy:'0'})).pump_energy_kwh,0));
test('no flow produces undefined per m3 energy',()=>assert.equal(analyzeSingleMeter(rows(15,{step:0})).energy_kwh_per_m3,null));
test('synthetic demo never admitted as operator readings',()=>{assert.throws(()=>analyzeSingleMeter(demoCSV()),EvidenceHold);const a=analyzeSingleMeter(demoCSV(),{allowBuiltInDemo:true});assert.equal(a.evidence_state,'SYNTHETIC_DEMONSTRATION')});
test('relabelled synthetic meter still HOLD',()=>assert.throws(()=>analyzeSingleMeter(demoCSV().replaceAll('SYNTHETIC_DEMONSTRATION','OPERATOR_SUPPLIED_READING')),EvidenceHold));
test('reject too few readings',()=>assert.throws(()=>analyzeSingleMeter(rows(14)),EvidenceHold));
test('reject missing date',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'2025-01-07','2025-01-08')),EvidenceHold));
test('reject rollback',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_001,2000,L')),EvidenceHold));
test('reject mixed units',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_001,7000,US_GAL')),EvidenceHold));
test('reject changed meter',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_002,7000,L')),EvidenceHold));
test('reject negative',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_001,-7000,L')),EvidenceHold));
test('reject unsafe integer',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_001,99999999999999999,L')),EvidenceHold));
test('reject header changed',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'cumulative_reading','flow_rate')),EvidenceHold));
test('reject unknown unit',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L','SOURCE_001,7000,ML')),EvidenceHold));
test('reject observation kind mix',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001,7000,L,5,OPERATOR_SUPPLIED_READING','SOURCE_001,7000,L,5,SYNTHETIC_DEMONSTRATION')),EvidenceHold));
test('template is blank and cannot be falsely audited',()=>assert.throws(()=>analyzeSingleMeter(templateCSV()),EvidenceHold));
test('valid BOM CRLF CSV',()=>assert.equal(analyzeSingleMeter('\uFEFF'+rows().replaceAll('\n','\r\n')).interval_count,14));
test('reject malformed quote',()=>assert.throws(()=>analyzeSingleMeter(change(rows(),'SOURCE_001','SOURCE"_001')),EvidenceHold));
test('reject huge file',()=>assert.throws(()=>analyzeSingleMeter('x'.repeat(1000001)),EvidenceHold));

test('SHA-256 source fingerprint matches standard test vector',()=>assert.equal(sha256Hex('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));

test('report SHA-256 matches core calculation',()=>{const raw=rows();assert.equal(analyzeSingleMeter(raw).source_integrity_sha256,sha256Hex(raw))});