// TEST HARNESS ONLY. Signed publisher identity and separate review proof for a
// disposable read-only capability. No production authority or public catalog writes.
import crypto from 'node:crypto';

export const CANDIDATE_SCHEMA='evercraft.operator-lab-candidate.v1';
export const REVIEW_SCHEMA='evercraft.operator-lab-review.v1';
export const TEST_SCOPE='synthetic_loopback_only';
export const TEST_TOOL='operator_probe_nonce';
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function exact(v,fields,label){
  if(!isObj(v)||Object.keys(v).sort().join('|')!==[...fields].sort().join('|'))throw Error(label+' shape invalid');
}
export const fingerprint=key=>crypto.createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
export const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const signDocument=(body,privateKey)=>({body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')});
function verifiedEnvelope(doc,publicKey,label){
  exact(doc,['body','signature'],label);
  if(typeof doc.signature!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(doc.signature))throw Error(label+' signature malformed');
  const sig=Buffer.from(doc.signature,'base64');
  if(sig.length!==64||!crypto.verify(null,Buffer.from(JSON.stringify(doc.body)),publicKey,sig))throw Error(label+' signature verification failed');
}
export function makeTestReviewGate({candidate,approval,publisherPublicKey,reviewerPublicKey,clock=()=>Date.now()}){
  if(!publisherPublicKey||!reviewerPublicKey)throw Error('Two independent verification keys required');
  if(fingerprint(publisherPublicKey)===fingerprint(reviewerPublicKey))throw Error('Publisher cannot approve own candidate');
  verifiedEnvelope(candidate,publisherPublicKey,'Publisher candidate');
  const c=candidate.body;
  exact(c,['schema','id','version','publisher_key_id','transport','server_name','tool_name','side_effects'], 'Candidate');
  if(c.schema!==CANDIDATE_SCHEMA||c.id!=='test.operator.nonce'||c.version!=='0.1.0'
    ||c.publisher_key_id!==fingerprint(publisherPublicKey)||c.transport!=='mcp-stdio'
    ||c.server_name!=='evercraft-operator-test-tool'||c.tool_name!==TEST_TOOL
    ||c.side_effects!=='read_only')throw Error('Candidate exceeds fixed test-only capability contract');
  verifiedEnvelope(approval,reviewerPublicKey,'Reviewer receipt');
  const a=approval.body;
  exact(a,['schema','candidate_sha256','reviewer_key_id','scope','allowed_tool','expires_at','issued_at'], 'Review');
  if(a.schema!==REVIEW_SCHEMA||a.candidate_sha256!==digest(c)||a.reviewer_key_id!==fingerprint(reviewerPublicKey)
    ||a.scope!==TEST_SCOPE||a.allowed_tool!==TEST_TOOL
    ||typeof a.issued_at!=='string'||typeof a.expires_at!=='string')throw Error('Review does not authorize exact candidate and scope');
  const issued=Date.parse(a.issued_at),expires=Date.parse(a.expires_at);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued
    ||expires-issued>3600000)throw Error('Test receipt TTL must be at most one hour');
  let revoked=false;
  const check=()=>{
    if(revoked)throw Error('Review receipt revoked');
    const now=clock();
    if(!Number.isFinite(now)||now<issued||now>=expires)throw Error('Review receipt not currently valid');
  };
  // The existence of this review simulation grants no Evercraft/Fabric authority.
  return {
    check,
    revoke(){revoked=true},
    get state(){try{check();return 'reviewed_test_loopback_only'}catch{return 'held'}},
    evidence(){return {
      candidate_sha256:digest(c),publisher_key_id:fingerprint(publisherPublicKey),
      reviewer_key_id:fingerprint(reviewerPublicKey),scope:TEST_SCOPE,
      allowed_tool:TEST_TOOL,approved_for_test:!revoked&&clock()>=issued&&clock()<expires,
      evercraft_publication_granted:false,production_execution_granted:false,
      commerce_granted:false,independent_human_review_verified:false,
    }},
  };
}
