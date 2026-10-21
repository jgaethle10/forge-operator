#!/usr/bin/env node
/**
 * Nepal 002 candidate-only bridge evidence validator.
 * Intentionally makes no satellite/field/route access determinations.
 * Zero external dependencies, no network or secrets access.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INCIDENT_ID = 'nepal-budhi-gandaki-2026-10-11';
export const HEADERS = [
  'incident_id', 'candidate_id', 'crossing_name_as_reported', 'structure_class',
  'source_reported_state', 'validation_question', 'source_url', 'event_date',
  'verification_level', 'unique_structure_confirmed', 'latitude', 'longitude',
  'geometry_status', 'public_route_status'
];

/** RFC4180-style CSV parser: handles BOM, quoted fields, commas, CRLF, newlines. */
export function parseCsv(text) {
  let input = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else { field += ch; }
      continue;
    }
    if (afterQuote) {
      if (ch !== ',' && ch !== '\n' && ch !== '\r') throw new Error('Invalid characters after quoted field at offset ' + i);
      afterQuote = false;
    }
    if (ch === '"') {
      if (field.length) throw new Error('Unexpected quote in unquoted field at offset ' + i);
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.length > 0)) rows.push(row);
      row = [];
    } else { field += ch; }
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  row.push(field);
  if (row.some(v => v.length > 0)) rows.push(row);
  return rows;
}

function isoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s;
}
function isHttps(s) {
  try { const url = new URL(s); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
const issues = (id, field, message) => ({ candidate_id:id, field, message });

/** Fail closed: reports can ONLY be candidates and NEVER become route clearances. */
export function validate(text) {
  let rows;
  try { rows = parseCsv(text); }
  catch (error) { return { ok:false, errors:[issues('CSV','parse',error.message)], candidates:[], review_queue:[] }; }
  if (!rows.length) return {ok:false,errors:[issues('CSV','headers','CSV empty')],candidates:[],review_queue:[]};
  const [headers,...records] = rows;
  const errors = [];
  if (headers.join('\0') !== HEADERS.join('\0')) {
    errors.push(issues('CSV','headers','Header mismatch; expected exact ' + HEADERS.join(',')));
    return {ok:false,errors,candidates:[],review_queue:[]};
  }
  const seen = new Set();
  const candidates = [], review_queue = [];
  for (let i=0; i<records.length; i++) {
    const record=records[i];
    const id=record[1]||'row-'+(i+2);
    if (record.length !== HEADERS.length) { errors.push(issues(id,'columns','Row '+(i+2)+': expected '+HEADERS.length+' fields, got '+record.length));continue; }
    const r=Object.fromEntries(headers.map((h,j)=>[h,record[j]]));
    if (seen.has(r.candidate_id)) errors.push(issues(id,'candidate_id','Duplicate candidate ID'));
    seen.add(r.candidate_id);
    if (!/^BG-\d{3}$/.test(id)) errors.push(issues(id,'candidate_id','Expected BG-NNN candidate ID'));
    if (r.incident_id !== INCIDENT_ID) errors.push(issues(id,'incident_id','Wrong incident: never reuse August Rasuwa data as October Gorkha evidence'));
    if (!r.crossing_name_as_reported.trim()) errors.push(issues(id,'crossing_name_as_reported','Reported name required'));
    if (!r.structure_class.trim()) errors.push(issues(id,'structure_class','Structure class required'));
    if (!r.source_reported_state.trim()) errors.push(issues(id,'source_reported_state','Reported state required'));
    if (!r.validation_question.trim()) errors.push(issues(id,'validation_question','An explicit human review question is required'));
    if (!isHttps(r.source_url)) errors.push(issues(id,'source_url','A direct HTTPS source URL is required'));
    if (!isoDate(r.event_date) || r.event_date < '2026-10-11') errors.push(issues(id,'event_date','Invalid or pre-event date'));
    if (r.verification_level !== 'attributed report only') errors.push(issues(id,'verification_level','Candidate intake must remain attributed report only'));
    if (r.unique_structure_confirmed !== 'NO') errors.push(issues(id,'unique_structure_confirmed','Human-confirmed unique structures require a separate authorized adjudication pipeline'));
    if (r.latitude.trim() || r.longitude.trim()) errors.push(issues(id,'geometry','Candidate-only CSV may not publish inferred coordinates'));
    if (r.geometry_status !== 'NOT PROVIDED') errors.push(issues(id,'geometry_status','No validated geometry is present in this intake'));
    if (r.public_route_status !== 'NOT DETERMINED') errors.push(issues(id,'public_route_status','Never infer route safety, passability or closures from media reports'));
    candidates.push({candidate_id:id, crossing_name_as_reported:r.crossing_name_as_reported, source_url:r.source_url, verification_level:r.verification_level, geometry:null, route_safety:null});
    review_queue.push({candidate_id:id,question:r.validation_question,requires:['Nepal-led local identification','dated authoritative geometry or approved imagery','qualified human review']});
  }
  if (!records.length) errors.push(issues('CSV','rows','No candidate records'));
  return {ok: errors.length===0,incident_id:INCIDENT_ID,record_count:candidates.length,unique_structures_confirmed:0,geometries_validated:0,route_clearances:0,errors,candidates,review_queue};
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if(invoked) {
  const file=process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)),'data','crossings.csv');
  let result;
  try { result=validate(fs.readFileSync(file,'utf8')); }
  catch(error) { result={ok:false,errors:[{field:'read',message:error.message}]}; }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=result.ok?0:1;
}
