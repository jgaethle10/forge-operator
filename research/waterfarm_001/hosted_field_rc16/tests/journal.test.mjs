import test from 'node:test';
import assert from 'node:assert/strict';
import {blankJournal,addReading,toMeterCSV,preview,researchAudit,validateJournal,nextDate,backupJSON,restoreBackupText} from '../app/journal.mjs';
import {analyzeSingleMeter} from '../app/core.mjs';
function filled({meterId='WELL-A',unit='US_GAL',energy=true}={}){
 let j=blankJournal(meterId,unit),date='2026-10-01';
 for(let i=0;i<15;i++){
   addReading(j,{date,reading:String(100+i*100),pump_kwh_since_previous:i===0?'':energy?'1.5':''});date=nextDate(date);
 }
 return j;
}
test('fifteen readings become fourteen days',()=>{const j=filled();const p=preview(j);assert.equal(p.completed_intervals,14);assert.equal(p.remaining_readings,0);assert.equal(p.ready,true);});
test('one-meter export accepted by RC12 engine',()=>{const j=filled();const result=researchAudit(j);assert.equal(result.interval_count,14);assert.ok(Math.abs(result.total_source_withdrawal_l-1400*3.785411784)<0.0005);assert.equal(result.evidence_state,'OPERATOR_SUPPLIED_UNVERIFIED');assert.equal(result.water_savings_verified,false);});
test('CSV export same result as standalone analysis',()=>{const j=filled({unit:'M3'});assert.deepEqual(researchAudit(j),analyzeSingleMeter(toMeterCSV(j)));});
test('missing optional kWh remains unknown',()=>{const result=researchAudit(filled({energy:false}));assert.equal(result.energy_kwh_per_m3,null);assert.equal(result.energy_intervals_missing,14);});
test('one unknown energy interval makes total energy unknown',()=>{const j=filled();j.records[3].pump_kwh_since_previous='';const a=researchAudit(j);assert.equal(a.pump_energy_kwh,null);assert.equal(a.energy_intervals_missing,1);});
test('reject missing date without fake zero days',()=>{const j=blankJournal('WELL-01','L');addReading(j,{date:'2026-10-01',reading:'100'});assert.throws(()=>addReading(j,{date:'2026-10-03',reading:'110'}),/HOLD/);assert.equal(j.records.length,1);});
test('reject duplicated date',()=>{const j=blankJournal('WELL-01','L');addReading(j,{date:'2026-10-01',reading:'100'});assert.throws(()=>addReading(j,{date:'2026-10-01',reading:'101'}),/HOLD/);});
test('reject decreasing cumulative meter',()=>{const j=blankJournal('WELL-01','L');addReading(j,{date:'2026-10-01',reading:'100'});assert.throws(()=>addReading(j,{date:'2026-10-02',reading:'90'}),/HOLD/);});
test('reject phantom first-day energy',()=>{const j=blankJournal('WELL-01','L');assert.throws(()=>addReading(j,{date:'2026-10-01',reading:'100',pump_kwh_since_previous:'2'}),/HOLD/);});
test('reject fixture IDs',()=>{for(const bad of ['SYNTHETIC_01','DEMO01','TESTMETER','FICTIONAL'])assert.throws(()=>blankJournal(bad,'L'),/HOLD/);});
test('reject meter ID comma or newline',()=>{assert.throws(()=>blankJournal('WELL,A','L'),/HOLD/);assert.throws(()=>blankJournal('WELL\nA','L'),/HOLD/);assert.throws(()=>blankJournal('=CMD','L'),/HOLD/);assert.throws(()=>blankJournal('@SUM','L'),/HOLD/);});
test('reject unsupported unit',()=>assert.throws(()=>blankJournal('WELL-01','UK_GAL'),/HOLD/));
test('reject NaN, exponential and whitespace',()=>{for(const v of ['NaN','1e6',' 100','100 ','Infinity','-1']){const j=blankJournal('WELL-01','L');assert.throws(()=>addReading(j,{date:'2026-10-01',reading:v}),/HOLD/);}});
test('reject impossible calendar date',()=>{const j=blankJournal('WELL-01','L');assert.throws(()=>addReading(j,{date:'2026-02-30',reading:'4'}),/HOLD/);});
test('leap date increments',()=>assert.equal(nextDate('2024-02-28'),'2024-02-29'));
test('import backup schema validation rejects inserted garbage',()=>{const j=filled();j.records[0].notes='validated';assert.throws(()=>validateJournal(j),/HOLD/);});
test('import backup rejects edited source kind',()=>{const j=filled();j.evidence_state='SYNTHETIC';assert.throws(()=>validateJournal(j),/HOLD/);});
test('import backup rejects reordered days',()=>{const j=filled();const r=j.records[3];j.records[3]=j.records[4];j.records[4]=r;assert.throws(()=>validateJournal(j),/HOLD/);});
test('import backup resets report truth flags',()=>{const j=filled();const a=researchAudit(j);for(const k of ['leak_verified','water_savings_verified','calibration_verified','physically_verified'])assert.equal(a[k],false);});
test('backup fingerprints source CSV',()=>{const j=filled();assert.equal(JSON.parse(backupJSON(j)).backup_sha256,researchAudit(j).source_integrity_sha256);});
test('partial field journal exports but not auditable baseline',()=>{const j=blankJournal('WELL-01','L');addReading(j,{date:'2026-10-01',reading:'100'});assert.match(toMeterCSV(j),/OPERATOR_SUPPLIED_READING/);assert.throws(()=>researchAudit(j),/HOLD/);});
test('changed decimals reject leading space in existing RC12 parser',()=>{const csv=toMeterCSV(filled()).replace('100,US_GAL',' 100,US_GAL');assert.throws(()=>analyzeSingleMeter(csv),/HOLD/)});

test('reject future date masquerading as an observed reading',()=>{const j=blankJournal('WELL-1','L');assert.throws(()=>addReading(j,{date:'2099-01-01',reading:'100'}),/Future/);assert.equal(j.records.length,0);});
test('plain-text backup round trips with immutable integrity',()=>{const j=filled();const restored=restoreBackupText(backupJSON(j));assert.deepEqual(restored,j);assert.equal(researchAudit(restored).interval_count,14);});
test('manually pasted backup rejects corrupted source before replacing records',()=>{const j=filled(),b=JSON.parse(backupJSON(j));b.records[14].reading='1501';assert.throws(()=>restoreBackupText(JSON.stringify(b)),/fingerprint/);assert.equal(j.records[14].reading,'1500');});
test('reject invalid/oversized backup paste',()=>{for(const t of ['','not JSON','{}'.padEnd(1000001,' '),'[]'])assert.throws(()=>restoreBackupText(t),/HOLD/);});
test('future-dated backup is held even if it has a recomputed source fingerprint',()=>{const j=filled(),b=JSON.parse(backupJSON(j));b.records[0].date='2099-01-01';assert.throws(()=>restoreBackupText(JSON.stringify(b)),/HOLD/);});
