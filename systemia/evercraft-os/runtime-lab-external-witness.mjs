/**
 * OFFLINE, REVIEW-HELD. Verifies a detached checkpoint witness signed by a separately
 * enrolled Ed25519 public key and pinned by an OUT-OF-DOMAIN commitment digest.
 *
 * This module never issues witnesses, trusts the local journal as its own anchor,
 * persists signing keys, or mutates journal state. A host must supply the latest
 * trusted receipt and its commitment from independent custody. If the host can
 * replay both an old receipt and its commitment, freshness is NOT established.
 */
import {createHash, createPublicKey, verify} from 'node:crypto';

const ENVELOPE='evercraft.os.lab-external-witness-envelope.v1';
const BODY='evercraft.os.lab-external-witness-body.v1';
const DOMAIN=Buffer.from('evercraft.os.lab-external-witness.v1\0');
const ZERO='sha256:'+'0'.repeat(64);
const HASH=/^sha256:[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9_.:-]{1,120}$/;
const MAX_AGE=120_000;
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const bytes=x=>Buffer.from(JSON.stringify(canon(x)));
const digest=x=>'sha256:'+createHash('sha256').update(bytes(x)).digest('hex');
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
function iso(x){if(typeof x!=='string')throw Error('witness_time_invalid');const t=Date.parse(x);if(!Number.isFinite(t)||new Date(t).toISOString()!==x)throw Error('witness_time_invalid');return t;}
const held=(reason)=>({state:'held',reason,independently_witnessed:false,mutation_performed:false});

export class EvercraftOsLabExternalWitnessGate {
  /** witnessSource supplies {receipt, committedDigest} from an independent custodian. */
  constructor({journalId,publicKey,witnessSource,now=()=>new Date()}={}){
    if(typeof journalId!=='string'||!ID.test(journalId))throw Error('witness_journal_id_invalid');
    if(typeof publicKey!=='string')throw Error('witness_pinned_key_required');
    this.key=createPublicKey(publicKey);
    if(this.key.asymmetricKeyType!=='ed25519')throw Error('witness_pinned_key_not_ed25519');
    if(typeof witnessSource!=='function'||typeof now!=='function')throw Error('witness_independent_source_required');
    this.journalId=journalId;this.source=witnessSource;this.now=now;
  }
  /** No mutations, writes, permit minting or repair; exact checkpoint binding. */
  inspect(journal){
    try{
      if(!journal||!['clean_empty','verified_local_chain'].includes(journal.state)||!Number.isSafeInteger(journal.count)||journal.count<0||!HASH.test(journal.head_hash))throw Error('witness_local_journal_not_verified');
      const supplied=this.source();
      if(!exact(supplied,['receipt','committedDigest'])||!HASH.test(supplied.committedDigest))throw Error('witness_external_commitment_missing');
      const e=supplied.receipt;
      if(!exact(e,['schema','signature_algorithm','body','signature_base64'])||e.schema!==ENVELOPE||e.signature_algorithm!=='ed25519')throw Error('witness_envelope_invalid');
      const b=e.body;
      if(!exact(b,['schema','journal_id','sequence','head_hash','issued_at','expires_at','witness_epoch'])||b.schema!==BODY||b.journal_id!==this.journalId||!Number.isSafeInteger(b.sequence)||b.sequence<0||!Number.isSafeInteger(b.witness_epoch)||b.witness_epoch<1||!HASH.test(b.head_hash))throw Error('witness_body_invalid');
      if(digest(e)!==supplied.committedDigest)throw Error('witness_external_commitment_mismatch');
      if(typeof e.signature_base64!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(e.signature_base64))throw Error('witness_signature_invalid');
      const sig=Buffer.from(e.signature_base64,'base64');
      if(sig.length!==64||!verify(null,Buffer.concat([DOMAIN,bytes(b)]),this.key,sig))throw Error('witness_signature_invalid');
      const issued=iso(b.issued_at),expires=iso(b.expires_at),at=new Date(this.now()).getTime();
      if(!Number.isFinite(at)||issued>at||expires<=at||expires<=issued||expires-issued>MAX_AGE)throw Error('witness_expired_or_future');
      if(b.sequence!==journal.count||b.head_hash!==journal.head_hash)throw Error('witness_checkpoint_diverged');
      if(b.sequence===0&&b.head_hash!==ZERO)throw Error('witness_genesis_mismatch');
      return {state:'witnessed_exact_checkpoint',journal_id:b.journal_id,sequence:b.sequence,head_hash:b.head_hash,witness_epoch:b.witness_epoch,
        committed_digest:supplied.committedDigest,independently_witnessed:true,mutation_performed:false,
        caveat:'Only against this externally pinned commitment; external custody/freshness not proven by this module.'};
    }catch(error){return held(String(error?.message||error));}
  }
}
export const LAB_EXTERNAL_WITNESS_ENVELOPE=ENVELOPE;
export const LAB_EXTERNAL_WITNESS_BODY=BODY;
export const LAB_EXTERNAL_WITNESS_DOMAIN=DOMAIN.toString('utf8');
export const hashLabExternalWitnessReceipt=digest;
