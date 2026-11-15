#!/usr/bin/env node
// Prepare verifiable claims for an independent Evercraft Journal editorial gate.
// This code does NOT approve, publish, sign, or distribute a story.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildClaimReactorPacket } from './claim-reactor.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const clean=value=>String(value??'').trim();
const validId=id=>/^[a-zA-Z0-9:_.-]+$/.test(clean(id));
const assertUnique=(items,key,label)=>{
  const seen=new Set();
  for(const item of items){
    const id=clean(item?.[key]);
    if(!validId(id)||seen.has(id)) throw Error(label+': missing, malformed or duplicate '+key);
    seen.add(id);
  }
  return seen;
};
const refs=value=>Array.isArray(value)?value:[];

export function validateEditorialClaimInput(input){
  if(input?.schema!=='evercraft.journal.claim-evidence-input.v1') throw Error('Unsupported claim input schema');
  if(input.release_state!=='candidate_only_not_approved'||!clean(input.story_id)) throw Error('Candidate-only story identity is required');
  for(const k of ['editorial_gate','production_grade','publication_authority','publication_receipt','systemia_release','clip_authorization','status']){
    if(Object.hasOwn(input,k)) throw Error('Claim input may not claim publication authority: '+k);
  }
  if(!input.artifact||!clean(input.artifact.artifact_id)) throw Error('Claim input requires an immutable source artifact reference');
  if(!Array.isArray(input.sources)||input.sources.length<2) throw Error('At least two sources required');
  if(!Array.isArray(input.evidence)||!input.evidence.length) throw Error('Evidence ledger required');
  if(!Array.isArray(input.claims)||!input.claims.length) throw Error('Claim ledger required');
  const sourceIds=assertUnique(input.sources,'source_id','source');
  const evidenceIds=assertUnique(input.evidence,'evidence_id','evidence');
  assertUnique(input.claims,'claim_id','claim');
  for(const s of input.sources){
    const u=new URL(s.url);
    if(u.protocol!=='https:'||u.username||u.password||!u.hostname) throw Error('Source URLs must be uncredentialed HTTPS');
    if(!s.publisher||!s.title) throw Error('Source requires publisher and title');
  }
  for(const e of input.evidence){
    if(!clean(e.summary)||!refs(e.source_refs).length) throw Error('Evidence requires summary and citations');
    for(const ref of e.source_refs) if(!sourceIds.has(ref)) throw Error('Unknown source reference: '+ref);
  }
  for(const c of input.claims){
    if(!clean(c.claim)||!refs(c.supporting_evidence_refs).length) throw Error('Claim requires text and a supporting evidence reference');
    for(const ref of [...refs(c.supporting_evidence_refs),...refs(c.contradicting_evidence_refs)])
      if(!evidenceIds.has(ref)) throw Error('Unknown claim evidence reference: '+ref);
  }
  if(!Array.isArray(input.required_next_gates)||!input.required_next_gates.includes('independent_editorial_10_of_10'))
    throw Error('Independent editorial review gate required');
  if(!input.required_next_gates.includes('systemia_signed_publication_release'))
    throw Error('Actual Systemia release gate required');
  return input;
}

export function runEditorialClaimPreflight(input){
  const cleanInput=validateEditorialClaimInput(structuredClone(input));
  const packet=buildClaimReactorPacket(cleanInput);
  // Inherent Reactor result has no publication authority, even if all evidence is acceptable.
  if(packet.publication_authority!==false||packet.claims.some(c=>c.publication_authority!==false))
    throw Error('Claim reactor authority boundary violated');
  const unresolved=refs(cleanInput.unresolved).map(clean).filter(Boolean);
  return {
    schema:'evercraft.journal.claim-preflight-report.v1',
    story_id:cleanInput.story_id,
    candidate_state:'awaiting_independent_editorial_review',
    claim_reactor:packet,
    evidence_count:packet.evidence.length,
    source_count:packet.sources.length,
    claim_count:packet.claims.length,
    evidence_preflight_ready:packet.ready_for_editorial_preflight,
    publication_blockers:packet.packet_blockers,
    unresolved,
    next_gates:cleanInput.required_next_gates,
    editorial_gate:{status:'not_accepted',score:null,independent_review_receipt:null},
    visual_review_state:'not_accepted',
    systemia_publication_release:null,
    journal_publication_receipt:null,
    clip_provider_receipts:[],
    publication_authority:false,
    public_article_status:'not_published'
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const file=process.argv[2]||path.join(here,'editorial-queue/2026-11-05-chainsaw-claim-input.json');
  const result=runEditorialClaimPreflight(JSON.parse(fs.readFileSync(file,'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.evidence_preflight_ready) process.exitCode=2;
}
