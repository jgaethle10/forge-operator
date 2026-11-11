/** Evercraft Aqua RC13 Field Notebook, offline/manual observational workflow.
 * A browser input is an assertion, never independently verified evidence.
 * No automated irrigation control, secrets, or outgoing network operations.
 */
import {analyzeSingleMeter, FIELDS, UNITS, EvidenceHold, sha256Hex} from './core.mjs';
export const JOURNAL_SCHEMA='evercraft.aqua.field-notebook.v1';
const DAY_MS=86400000;
export const STORE_KEY='evercraft-aqua-field-notebook-v1';

function checkDate(s){
  if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s))throw new EvidenceHold('date must be YYYY-MM-DD');
  const n=Date.parse(s+'T12:00:00Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw new EvidenceHold('calendar date does not exist');
  return n;
}
export function nextDate(s){return new Date(checkDate(s)+DAY_MS).toISOString().slice(0,10);}
export function todayLocal(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function positiveSafe(raw,name){
  if(typeof raw!=='string'||raw!==raw.trim()||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))throw new EvidenceHold(`${name} must be a plain nonnegative number`);
  const x=Number(raw);if(!Number.isFinite(x)||x>Number.MAX_SAFE_INTEGER)throw new EvidenceHold(`${name} outside safe numeric range`);
  return x;
}
export function blankJournal(meterId,units){
  if(typeof meterId!=='string'||!meterId.trim()||meterId.length>60||!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(meterId)||/(DEMO|SYNTH|TEST|FICTION)/i.test(meterId))throw new EvidenceHold('Use a real, simple meter label (not a demo label)');
  if(!Object.hasOwn(UNITS,units))throw new EvidenceHold('Choose L, US_GAL or M3');
  return {schema:JOURNAL_SCHEMA,meter_id:meterId,units,records:[],evidence_state:'OPERATOR_SUPPLIED_UNVERIFIED'};
}
export function validateJournal(j){
  if(!j||Object.getPrototypeOf(j)!==Object.prototype||j.schema!==JOURNAL_SCHEMA||!Array.isArray(j.records)||j.records.length>370)throw new EvidenceHold('Unsupported or damaged field notebook');
  const clean=blankJournal(j.meter_id,j.units);
  if(j.evidence_state!=='OPERATOR_SUPPLIED_UNVERIFIED')throw new EvidenceHold('Unsupported journal source classification');
  for(const r of j.records){
    if(!r||Object.getPrototypeOf(r)!==Object.prototype||Object.keys(r).sort().join('|')!=='date|pump_kwh_since_previous|reading')throw new EvidenceHold('Unexpected record schema');
    addReading(clean,{date:r.date,reading:r.reading,pump_kwh_since_previous:r.pump_kwh_since_previous});
  }
  return clean;
}
export function addReading(j,{date,reading,pump_kwh_since_previous=''}){
  if(!j||j.schema!==JOURNAL_SCHEMA||!Array.isArray(j.records))throw new EvidenceHold('Start a notebook before recording data');
  if(j.records.length>=370)throw new EvidenceHold('370-reading safety maximum reached; export and archive');
  checkDate(date);
  const value=positiveSafe(reading,'Meter totalizer');
  const first=j.records.length===0;
  const energy=pump_kwh_since_previous===''?'':String(positiveSafe(pump_kwh_since_previous,'Interval pump kWh'));
  if(first && energy!=='')throw new EvidenceHold('First reading must have no previous-interval kWh');
  if(!first){
    const prev=j.records.at(-1);
    if(date!==nextDate(prev.date))throw new EvidenceHold('Dates must be consecutive; missing reading or duplicate day');
    if(value<Number(prev.reading))throw new EvidenceHold('Totalizer decreased: possible reset/rollover, STOP and review');
    if(!Number.isSafeInteger(Math.trunc(value)))throw new EvidenceHold('Unsafe meter totalizer');
    const volume=(value-Number(prev.reading))*UNITS[j.units];
    if(!Number.isFinite(volume)||volume>Number.MAX_SAFE_INTEGER)throw new EvidenceHold('Unsafe interval volume');
  }
  j.records.push({date,reading:String(value),pump_kwh_since_previous:energy});
  return j;
}
export function toMeterCSV(j){
  const x=validateJournal(j);
  const rows=[FIELDS.join(',')];
  for(const r of x.records)rows.push([r.date,x.meter_id,r.reading,x.units,r.pump_kwh_since_previous,'OPERATOR_SUPPLIED_READING'].join(','));
  return rows.join('\n')+'\n';
}
export function preview(j){
  const x=validateJournal(j),count=x.records.length;
  return {reading_count:count,completed_intervals:Math.max(0,count-1),remaining_readings:Math.max(0,15-count),
    next_date:count?nextDate(x.records.at(-1).date):todayLocal(),first_date:count?x.records[0].date:null,
    last_reading:count?x.records.at(-1).reading:null,ready:count>=15};
}
export function researchAudit(j){
  const csv=toMeterCSV(j);
  const p=preview(j);if(!p.ready)throw new EvidenceHold(`Need ${p.remaining_readings} more reading(s) to meet minimum 14-day baseline`);
  return analyzeSingleMeter(csv);
}
export function backupJSON(j){
  const x=validateJournal(j);return JSON.stringify({ ...x,backup_sha256:sha256Hex(toMeterCSV(x))},null,2)+'\n';
}
