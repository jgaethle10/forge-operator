// Read-only binding to the existing TOWI resident's private dossier accessor.
// No resident creation, startup, state mutation, evidence promotion or new queue.
import {createHash} from 'node:crypto';
import {stageRecoveryResearch} from './intake-bridge.mjs';
const hash=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function bindTowiRecoveryRecord({towiResident,dossierId,record,expectedDossierDigest}={}){
 if(!/^towi-dossier:[a-z0-9-]{1,80}$/.test(dossierId||'')||
    typeof towiResident?.dossier!=='function')throw Error('towi_dossier_accessor_required');
 const dossier=towiResident.dossier(dossierId);
 if(dossier?.schema!=='evercraft.towi.dossier.v1'||dossier.dossier_id!==dossierId||
    dossier.publication_authority!==false||!Array.isArray(dossier.research_evidence))
  throw Error('towi_dossier_missing_or_invalid');
 const digest=hash(dossier);
 if(expectedDossierDigest!==digest)throw Error('towi_dossier_revision_mismatch');
 // Research evidence only; do not guess mappings from radar truth states.
 const refs=record?.evidence;
 if(!Array.isArray(refs)||refs.length===0||!refs.every(e=>
   e&&['observed','reported','modeled'].includes(e.state)&&
   dossier.research_evidence.some(row=>row.source_family===e.source&&
    row.evidence_state===e.state&&Array.isArray(row.provenance_refs)&&
    row.provenance_refs.includes(e.ref))))
  throw Error('recovery_evidence_not_bound_to_towi');
 return {dossierKey:dossierId,sourceDigest:digest,record,
  dossierReferenceMatched:true,independentSourceTruthVerified:false,publicationAuthority:false};
}
// Only call from an already authorized local composition root. The supplied
// accessor is not an authentication mechanism; it must be the real resident.
export function stageTowiRecoveryResearch({towiResident,dossierId,expectedDossierDigest,record,...options}={}){
 const binding=bindTowiRecoveryRecord({towiResident,dossierId,record,expectedDossierDigest});
 const result=stageRecoveryResearch({...options,record:binding.record,
  dossierKey:binding.dossierKey,sourceDigest:binding.sourceDigest});
 return {...result,dossierReferenceMatched:true,independentSourceTruthVerified:false,publicationAuthority:false};
}
