// FindMyPart universal recovery planning v1.
// Evidence-first orchestration contract. No supplier searching or CAD analysis is claimed.
const PATHS=['original','interchange','salvage','cad_fabrication','repair','engineered_substitute'];
const SAFETY=/\b(brake|steering|airbag|seatbelt|seat belt|pressure vessel|gas valve|propeller|rotor|critical load|life support|medical implant|high voltage|battery pack)\b/i;
const text=(v,n)=>String(v??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
export function createRecoveryCase(input={}){
 const description=text(input.description,2000),equipment=text(input.equipment,300);
 const refs=(Array.isArray(input.references)?input.references:[]).slice(0,12).map(x=>({
  kind:['photo','manual','video','audio','measurement','cad','part_number'].includes(x?.kind)?x.kind:'other',
  label:text(x?.label,140),reference:text(x?.reference,300)
 })).filter(x=>x.label||x.reference);
 if(description.length<3&&!refs.length)throw Error('part_description_or_evidence_required');
 const safetyReview=SAFETY.test(description+' '+equipment);
 return {schema:'evercraft.findmypart.recovery-case.v1',
  description,equipment,references:refs,
  identification:{state:'unknown',candidate_part_numbers:[],observations:[]},
  safety:{review_required:safetyReview,reason:safetyReview?'Potential safety-critical application':'Use and loading not yet established'},
  tracks:PATHS.map(type=>({type,status:'not_searched',candidates:[]})),
  source_count:0,fulfillment:'not_authorized',
  note:'No inventory, compatibility, CAD manufacturability or replacement availability is established.'};
}
export function addRecoveryEvidence(recovery,{track,url,claim,sourceType='external_listing'}={}){
 if(!recovery||recovery.schema!=='evercraft.findmypart.recovery-case.v1')throw Error('invalid_case');
 if(!PATHS.includes(track))throw Error('invalid_recovery_track');
 let parsed;try{parsed=new URL(url)}catch{throw Error('source_url_required')}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('https_public_evidence_required');
 const hostname=parsed.hostname.toLowerCase();
 if(hostname==='localhost'||hostname.endsWith('.local')||hostname.endsWith('.localhost')||
  /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname))
  throw Error('private_source_not_allowed');
 const assertion=text(claim,800);
 if(assertion.length<5)throw Error('source_claim_required');
 const next=structuredClone(recovery);
 const target=next.tracks.find(t=>t.type===track);
 if(target.candidates.length>=40)throw Error('track_candidate_limit');
 if(target.candidates.some(c=>c.url===parsed.href))throw Error('duplicate_source');
 target.status='leads_recorded';
 target.candidates.push({url:parsed.href,claim:assertion,source_type:text(sourceType,80),
  identity:'unverified',fitment:'unverified',availability:'unverified',manufacturability:'unverified',
  safety_review_required:next.safety.review_required});
 next.source_count=next.tracks.reduce((n,t)=>n+t.candidates.length,0);
 return next;
}
export function summarizeRecovery(recovery){
 if(!recovery||recovery.schema!=='evercraft.findmypart.recovery-case.v1')throw Error('invalid_case');
 return {tracks:recovery.tracks.map(t=>({type:t.type,status:t.status,leads:t.candidates.length})),
  safety_review_required:recovery.safety.review_required,source_count:recovery.source_count,
  outcome:recovery.source_count?'unverified_leads_for_review':'no_search_completed',
  recommendation:'Confirm identity, dimensions, compatibility and safety before ordering, printing or adapting.'};
}
