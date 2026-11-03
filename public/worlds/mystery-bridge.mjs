/**
 * Read-only evidence projection into the existing Evercraft Worlds render loop.
 * The Window owns the fictional case; this bridge only adds inspectable markers.
 * No new renderer, world authority, persistence layer, server, or generated evidence.
 */
import {MYSTERY_SCHEMA} from '../the-window/mystery.mjs';

export const EVIDENCE_STATIONS = Object.freeze([
  Object.freeze({clueId:'register',label:'Workshop register',x:-8,z:1}),
  Object.freeze({clueId:'testimony',label:'Witness meeting point',x:2,z:4}),
  Object.freeze({clueId:'inventory',label:'Inventory container',x:-10,z:-7}),
  Object.freeze({clueId:'corroboration',label:'Return ledger',x:10,z:5})
]);

function assertCase(caseFile) {
  if (!caseFile || caseFile.schema!==MYSTERY_SCHEMA ||
      !Array.isArray(caseFile.clues) || caseFile.clues.length!==EVIDENCE_STATIONS.length ||
      !Number.isInteger(caseFile.revealed) || caseFile.revealed<0 ||
      caseFile.revealed>caseFile.clues.length || caseFile.accusation && typeof caseFile.accusation!=='object' ||
      !EVIDENCE_STATIONS.every((s,i)=>caseFile.clues[i]?.id===s.clueId)) {
    throw Error('Unsupported fictional evidence scenario');
  }
}
export function activeEvidenceStation(caseFile) {
  assertCase(caseFile);
  if (caseFile.accusation || caseFile.revealed===caseFile.clues.length) return null;
  return EVIDENCE_STATIONS[caseFile.revealed];
}
export function nearbyEvidenceStation(caseFile, x, z, reach=2.4) {
  const active=activeEvidenceStation(caseFile);
  if (!active || !Number.isFinite(x) || !Number.isFinite(z) ||
      !Number.isFinite(reach) || reach<=0 || reach>3.2) return null;
  return Math.hypot(x-active.x,z-active.z)<=reach ? active : null;
}
export function evidenceWorldEntities(caseFile) {
  assertCase(caseFile);
  return EVIDENCE_STATIONS.map((station,i)=>({
    id:'mystery:evidence:'+station.clueId,
    name:station.label,
    transform:{position:{x:station.x,y:.52,z:station.z}},
    tags:['worlds','evidence','fictional','local_rule_scenario'],
    properties:{
      clueId:station.clueId,
      sourceSchema:MYSTERY_SCHEMA,
      source:'fictional_local_projection',
      revealed:i<caseFile.revealed,
      active:i===caseFile.revealed&&!caseFile.accusation
    }
  }));
}
