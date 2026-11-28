// Prepare context evidence for an existing owner-selected TOWI dossier.
 // Never create radar signals, mutate a resident, admit a mission or claim corroboration.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const registry=JSON.parse(fs.readFileSync(new URL('./public-research-seeds.v1.json',import.meta.url),'utf8'));
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const families={'US EPA':'us-epa','WA Ecology':'wa-ecology','USDA ARS':'usda-ars','US DOE':'us-doe'};
export function prepareRecoveryEvidence({seedId,towiResident,dossierId,expectedDossierDigest,expectedSubjectKey}={}){
 const seed=registry.rows.find(r=>r.id===seedId);
 if(!seed)throw Error('recovery_seed_unknown');
 const dossier=towiResident?.dossier?.(dossierId);
 if(!dossier||dossier.schema!=='evercraft.towi.dossier.v1'||dossier.dossier_id!==dossierId||
   !expectedSubjectKey||dossier.subject_key!==expectedSubjectKey||dossier.publication_authority!==false)
   throw Error('recovery_existing_dossier_binding_required');
 const digest=hash(dossier);
 if(digest!==expectedDossierDigest)throw Error('recovery_dossier_revision_mismatch');
 const proposed=seed.sourceKeys.map(key=>{
   const source=registry.sources[key],family=families[source.family];
   if(!family||source.state!=='reported')throw Error('recovery_seed_source_invalid');
   const evidence={source_family:family,independence_group:family,evidence_state:'reported',
    relationship:'context',observed_at:registry.reviewedOn+'T00:00:00.000Z',
    provenance_refs:[source.url],summary:source.note,reliability:0.5};
   return {...evidence,evidence_id:'towi-evidence:recovery-'+hash([seedId,key,evidence]).slice(7)};
 });
 const pending=proposed.filter(row=>!(dossier.research_evidence||[]).some(x=>x.evidence_id===row.evidence_id));
 return {schema:'evercraft.circular-recovery.towi-evidence-plan.v1',seedId,dossierId,dossierDigest:digest,
  question:seed.question,next:seed.next,pendingEvidence:pending,alreadyPresent:proposed.length-pending.length,
  distinctReportedAgencyFamilies:new Set(proposed.map(x=>x.independence_group)).size,
  sourceTruthVerified:false,sourceBytesCaptured:false,independentCorroborationVerified:false,
  dossierMutated:false,editorialPromotionAuthorized:false,publicationAuthority:false,
  executionAuthority:false,ownerReviewRequired:true};
}
