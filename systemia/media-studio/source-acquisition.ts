import crypto from 'node:crypto';
import type {
  AspectRatio,
  RightsState,
  SourceAsset,
  VisualCoverageRequirement,
} from './types.js';

export type AcquisitionRightsState =
  | 'owned'
  | 'licensed'
  | 'public_domain'
  | 'permissioned'
  | 'unknown'
  | 'restricted';

export type SourceVisualState =
  | 'documentary_source'
  | 'illustrative_source'
  | 'synthetic_visualization';

export interface SourceProvenance {
  sourceId:string;
  canonicalSourceUrl?:string;
  publisher?:string;
  publishedAt?:string;
  capturedAt?:string;
  rightsBasis?:string;
  licenseId?:string;
  attribution?:string;
}

export interface SourceVisualMatchReceipt {
  schema:'evercraft.fallen.source-visual-match.v1';
  candidateId:string;
  subjectId:string;
  verifierId:string;
  verifierState:'declared'|'verified';
  score:number;
  threshold:number;
  evidenceRefs:string[];
}

export interface SourceAcquisitionRequest {
  schema:'evercraft.fallen.source-acquisition-request.v1';
  id:string;
  coverageRequirementId:string;
  subjectId:string;
  subjectLabel:string;
  preferredTreatment:VisualCoverageRequirement['preferredTreatment'];
  minScreenTimeSec:number;
  aspectRatio:AspectRatio;
  queryHints:string[];
  commercialUseRequired:boolean;
  sourceFirst:boolean;
}

export interface SourceCandidate {
  id:string;
  requestId:string;
  subjectId:string;
  mediaKind:'image'|'video';
  artifactPath?:string;
  artifactDigest?:string;
  sourceUri?:string;
  providerId:string;
  visualState:SourceVisualState;
  rights:AcquisitionRightsState;
  commercialUseAllowed:'yes'|'no'|'unknown';
  provenance:SourceProvenance;
  visualMatch:SourceVisualMatchReceipt;
  durationSec?:number;
  width?:number;
  height?:number;
  tags?:string[];
}

export interface AcquisitionAdmission {
  schema:'evercraft.fallen.source-acquisition-admission.v1';
  requestId:string;
  candidateId:string;
  status:'accepted'|'rejected';
  reasons:string[];
  artifactDigest?:string;
  receiptDigest:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function buildSourceAcquisitionRequests(input:{
  coverage:VisualCoverageRequirement[];
  aspectRatio:AspectRatio;
  storyPrompt:string;
}):SourceAcquisitionRequest[]{
  return input.coverage
    .filter(item=>item.status==='missing')
    .map((item,index)=>({
      schema:'evercraft.fallen.source-acquisition-request.v1' as const,
      id:`source-acq-${index+1}-${item.subjectId}`,
      coverageRequirementId:item.id,
      subjectId:item.subjectId,
      subjectLabel:item.subjectLabel,
      preferredTreatment:item.preferredTreatment,
      minScreenTimeSec:item.minScreenTimeSec,
      aspectRatio:input.aspectRatio,
      queryHints:[
        item.subjectLabel,
        `${item.subjectLabel} footage`,
        `${item.subjectLabel} public domain footage`,
        input.storyPrompt
      ],
      commercialUseRequired:true,
      sourceFirst:true
    }));
}

function rightsToSourceAsset(rights:AcquisitionRightsState):RightsState{
  if(rights==='owned') return 'owned';
  if(['licensed','public_domain','permissioned'].includes(rights)) return 'licensed';
  if(rights==='restricted') return 'restricted';
  return 'unknown';
}

export function admitSourceCandidate(
  request:SourceAcquisitionRequest,
  candidate:SourceCandidate,
):AcquisitionAdmission{
  const reasons:string[]=[];
  if(candidate.requestId!==request.id) reasons.push('request_id_mismatch');
  if(candidate.subjectId!==request.subjectId) reasons.push('subject_id_mismatch');
  if(!['image','video'].includes(candidate.mediaKind)) reasons.push('media_kind_invalid');
  if(!candidate.artifactPath) reasons.push('artifact_path_missing');
  if(!candidate.artifactDigest||!/^sha256:[a-f0-9]{64}$/i.test(candidate.artifactDigest)){
    reasons.push('artifact_digest_missing_or_invalid');
  }

  if(['restricted','unknown'].includes(candidate.rights)){
    reasons.push('rights_not_admissible');
  }
  if(request.commercialUseRequired&&candidate.commercialUseAllowed!=='yes'){
    reasons.push('commercial_use_not_verified');
  }

  const provenance=candidate.provenance;
  if(!provenance?.sourceId) reasons.push('provenance_source_id_missing');
  if(!provenance?.rightsBasis) reasons.push('provenance_rights_basis_missing');
  if(candidate.rights==='licensed'&&!provenance?.licenseId){
    reasons.push('license_id_missing');
  }

  const match=candidate.visualMatch;
  if(match?.schema!=='evercraft.fallen.source-visual-match.v1'){
    reasons.push('visual_match_receipt_missing');
  }else{
    if(match.candidateId!==candidate.id) reasons.push('visual_match_candidate_mismatch');
    if(match.subjectId!==request.subjectId) reasons.push('visual_match_subject_mismatch');
    if(match.verifierState!=='verified') reasons.push('visual_match_not_verified');
    if(!Number.isFinite(match.score)||!Number.isFinite(match.threshold)||match.score<match.threshold){
      reasons.push('visual_match_below_threshold');
    }
    if(!match.evidenceRefs?.length) reasons.push('visual_match_evidence_missing');
  }

  if(
    request.preferredTreatment==='documentary_or_verified_visualization' &&
    candidate.visualState==='synthetic_visualization'
  ){
    reasons.push('synthetic_cannot_satisfy_source_first_documentary_acquisition');
  }

  const body={
    requestId:request.id,
    candidateId:candidate.id,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)].sort(),
    artifactDigest:candidate.artifactDigest
  };
  return {
    schema:'evercraft.fallen.source-acquisition-admission.v1',
    ...body,
    status:body.status as 'accepted'|'rejected',
    receiptDigest:digest(body)
  };
}

export function sourceAssetFromAdmission(
  request:SourceAcquisitionRequest,
  candidate:SourceCandidate,
  admission:AcquisitionAdmission,
):SourceAsset{
  if(admission.status!=='accepted'){
    throw new Error('Cannot convert a rejected source acquisition into a SourceAsset.');
  }
  if(!candidate.artifactPath) throw new Error('Accepted candidate is missing artifactPath.');
  return {
    id:candidate.id,
    path:candidate.artifactPath,
    kind:candidate.mediaKind,
    durationSec:candidate.durationSec,
    width:candidate.width,
    height:candidate.height,
    rights:rightsToSourceAsset(candidate.rights),
    tags:[
      ...(candidate.tags??[]),
      request.subjectId,
      request.subjectLabel,
      `source-state:${candidate.visualState}`,
      `source-provider:${candidate.providerId}`
    ],
    notes:[
      `Acquired for ${request.coverageRequirementId}.`,
      `Rights basis: ${candidate.provenance.rightsBasis}.`,
      candidate.provenance.canonicalSourceUrl
        ? `Canonical source: ${candidate.provenance.canonicalSourceUrl}.`
        : ''
    ].filter(Boolean).join(' '),
    entityRefs:[request.subjectId]
  };
}

export function buildSourceCandidateInventory(input:{
  requests:SourceAcquisitionRequest[];
  candidates:SourceCandidate[];
}){
  const requestIds=new Set(input.requests.map(row=>row.id));
  const jobs=input.candidates.map(candidate=>{
    if(!requestIds.has(candidate.requestId)){
      throw new Error(`Candidate ${candidate.id} references unknown acquisition request ${candidate.requestId}.`);
    }
    const request=input.requests.find(row=>row.id===candidate.requestId)!;
    return {
      kind:'fallen_source_candidate' as const,
      key:candidate.id,
      request,
      candidate
    };
  });
  return {
    schema:'evercraft.fallen.source-candidate-inventory.v1' as const,
    jobs
  };
}
