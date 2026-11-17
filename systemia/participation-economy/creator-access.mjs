// Evercraft Home public-social creator boundary (development integration only).
// Verifies narrowly scoped, short-lived HMAC capabilities issued by a SEPARATE
// trusted identity service. Never reuse private operator Home credentials.
// Not a token issuer, HTTP server, public login, publisher, or payment gateway.
import {createHmac, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {openCreatorMediaStore} from './creator-media-store.mjs';
import {openCreatorRecordStore} from './creator-record-store.mjs';

const TOKEN_RE=/^hc1\.([A-Za-z0-9_-]{1,3072})\.([A-Za-z0-9_-]{43})$/;
const REF_RE=/^[A-Za-z0-9:_./-]{1,160}$/;
const SCOPES=new Set([
  'creator.submit','creator.read','creator.withdraw','creator.media',
  'editor.read','editor.review','editor.list'
]);
const EXPECTED_KEYS=['aud','exp','iat','iss','role','scopes','subject_ref','tenant_ref','v'];
const validRef=s=>typeof s==='string'&&REF_RE.test(s);
const fail=(reason)=>{throw Error('home_creator_access_'+reason);};
const canonicalBase64=s=>{
  const b=Buffer.from(s,'base64url');
  if(!b.length||b.toString('base64url')!==s)fail('token_encoding_invalid');
  return b;
};

export function createCreatorAccess({
  root,verification_key,issuer='evercraft.home.social.dev',
  audience='evercraft.home.creator-queue',now=()=>Math.floor(Date.now()/1000)
}={}){
  if(!Buffer.isBuffer(verification_key)||verification_key.length<32)
    fail('strong_secret_required');
  if(!validRef(issuer)||!validRef(audience))fail('authority_invalid');
  if(typeof now!=='function')fail('clock_invalid');
  const store=openCreatorRecordStore({root});
  const media=openCreatorMediaStore({root:path.join(root,'media')});
  function verify(token,scope){
    if(typeof token!=='string')fail('token_required');
    const m=TOKEN_RE.exec(token);
    if(!m)fail('token_invalid');
    const [_,encoded,sig]=m;
    const received=canonicalBase64(sig);
    const expected=createHmac('sha256',verification_key).update('hc1.'+encoded).digest();
    if(received.length!==expected.length||!timingSafeEqual(received,expected))
      fail('signature_invalid');
    let claims;
    try{claims=JSON.parse(canonicalBase64(encoded).toString('utf8'));}
    catch{fail('claims_invalid');}
    if(!claims||typeof claims!=='object'||Array.isArray(claims)||
       Object.keys(claims).sort().join('|')!==EXPECTED_KEYS.join('|'))
       fail('claim_shape_invalid');
    if(claims.v!==1||claims.iss!==issuer||claims.aud!==audience)fail('audience_invalid');
    if(!validRef(claims.tenant_ref)||!validRef(claims.subject_ref))fail('identity_invalid');
    if(!['creator','editor'].includes(claims.role))fail('role_invalid');
    if(!Array.isArray(claims.scopes)||claims.scopes.length<1||claims.scopes.length>4||
       claims.scopes.some(s=>typeof s!=='string'||!SCOPES.has(s))||
       new Set(claims.scopes).size!==claims.scopes.length)
       fail('scope_invalid');
    const prefix=claims.role==='creator'?'creator.':'editor.';
    if(claims.scopes.some(s=>!s.startsWith(prefix)))fail('role_scope_mismatch');
    if(!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
       claims.iat<1||claims.exp<=claims.iat||claims.exp-claims.iat>900)
       fail('lifetime_invalid');
    const current=now();
    if(!Number.isSafeInteger(current)||claims.iat>current+30||claims.exp<=current)
       fail('expired_or_future');
    if(!claims.scopes.includes(scope))fail('scope_denied');
    return {tenant_ref:claims.tenant_ref,subject_ref:claims.subject_ref,role:claims.role};
  }
  return Object.freeze({
    // Bounded development storage: caller bytes are never exposed as public URLs.
    async uploadMedia({token,bytes,declared_mime}={}){
      const actor=verify(token,'creator.media');
      return media.ingest({tenant_ref:actor.tenant_ref,creator_ref:actor.subject_ref,bytes,declared_mime});
    },
    // Unlike legacy metadata-only submit, a stored owned asset must exist and match
    // this authenticated tenant/creator before the story can enter the queue.
    async submitWithMedia({token,story}={}){
      const actor=verify(token,'creator.submit');
      if(!story||story.creator_ref!==actor.subject_ref)fail('creator_mismatch');
      await media.verify({tenant_ref:actor.tenant_ref,creator_ref:actor.subject_ref,asset_ref:story.asset_ref});
      return store.submit({tenant_ref:actor.tenant_ref,story});
    },
    // Metadata-only test path, NOT an accepted production upload/submission.
    // A production API must expose submitWithMedia, not this synthetic path.
    async submit({token,story}={}){
      const actor=verify(token,'creator.submit');
      if(!story||story.creator_ref!==actor.subject_ref)fail('creator_mismatch');
      return store.submit({tenant_ref:actor.tenant_ref,story});
    },
    async get({token,story_id}={}){
      // Either role can read, but creators can only inspect their own records.
      let actor;
      try{actor=verify(token,'creator.read');}
      catch(e){
        if(e.message!=='home_creator_access_scope_denied')throw e;
        actor=verify(token,'editor.read');
      }
      const item=await store.get({tenant_ref:actor.tenant_ref,story_id});
      if(!item)return null;
      if(actor.role==='creator'&&item.creator_ref!==actor.subject_ref)
        fail('creator_mismatch');
      return item;
    },
    async review({token,story_id,expected_head_hash,review}={}){
      const actor=verify(token,'editor.review');
      if(!review||review.reviewer_ref!==actor.subject_ref)fail('reviewer_mismatch');
      return store.review({tenant_ref:actor.tenant_ref,story_id,expected_head_hash,review});
    },
    async withdraw({token,story_id,expected_head_hash}={}){
      const actor=verify(token,'creator.withdraw');
      return store.withdraw({tenant_ref:actor.tenant_ref,story_id,expected_head_hash,actor_ref:actor.subject_ref});
    },
    async list({token}={}){
      const actor=verify(token,'editor.list');
      return store.list({tenant_ref:actor.tenant_ref});
    }
  });
}
