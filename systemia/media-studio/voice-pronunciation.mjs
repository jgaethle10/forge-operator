import crypto from 'node:crypto';

function filled(v){return typeof v==='string'&&v.trim().length>0;}
function locale(value){try{return Intl.getCanonicalLocales(value)[0];}catch{return null;}}
function hex(text){return crypto.createHash('sha256').update(JSON.stringify(text)).digest('hex');}

/** Bind versioned, separately approved lexicon assets to a speech request. No API calls. */
export function bindVoicePronunciation({plannedCue,bindings=[],strict=false}){
  if(!plannedCue || !Array.isArray(plannedCue.pronunciation))throw new Error('voice_pronunciation_cast_lexicon_missing');
  if(!Array.isArray(bindings))throw new Error('voice_pronunciation_bindings_not_array');
  if(!plannedCue.pronunciation.length)return null;
  const castLocale=locale(plannedCue.locale);
  if(!castLocale)throw new Error('voice_pronunciation_cast_locale_invalid');
  const candidates=bindings.filter(b=>locale(b?.locale)===castLocale);
  if(!candidates.length){
    if(strict)throw new Error('voice_pronunciation_dictionary_required_for_matched_terms');
    return null;
  }
  if(candidates.length>3)throw new Error('voice_pronunciation_provider_limit_three');
  if(candidates.some(b=>!filled(b.pronunciation_dictionary_id)||!filled(b.version_id)||!filled(b.approvalEvidenceRef)||b.approval!=='human_approved')){
    throw new Error('voice_pronunciation_dictionary_version_unapproved');
  }
  const seen=new Set();
  for(const candidate of candidates){
    if(!/^[A-Za-z0-9_-]{4,120}$/.test(candidate.pronunciation_dictionary_id) || !/^[A-Za-z0-9_-]{4,120}$/.test(candidate.version_id))throw new Error('voice_pronunciation_dictionary_id_unsafe');
    const key=candidate.pronunciation_dictionary_id;
    if(seen.has(key))throw new Error('voice_pronunciation_duplicate_dictionary');
    seen.add(key);
  }
  const locators=candidates.map(({pronunciation_dictionary_id,version_id})=>({pronunciation_dictionary_id,version_id}));
  return Object.freeze({
    schema:'evercraft.voice-foundry.pronunciation-request.v1',
    matchedTerms:plannedCue.pronunciation.map(x=>x.term),
    locale:castLocale,
    locators,
    digest:hex({locale:castLocale,locators,matchedTerms:plannedCue.pronunciation}),
    versionApprovalRefs:candidates.map(x=>x.approvalEvidenceRef),
    speechPronunciationVerified:false,
    publicationAuthorityGranted:false
  });
}
