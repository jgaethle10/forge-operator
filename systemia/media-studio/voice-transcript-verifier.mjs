import crypto from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/i;
const filled=x=>typeof x==='string'&&x.trim().length>0;
const round=x=>Math.round(x*10000)/10000;
function canonical(value){
  if(!filled(value))return null;
  try{return Intl.getCanonicalLocales(value)[0]??null;}catch{return null;}
}
function tokenize(value,locale){
  if(!filled(value)||value.length>10000)throw new Error('voice_transcript_text_invalid_or_too_long');
  const language=canonical(locale);
  if(!language)throw new Error('voice_transcript_locale_invalid');
  return [...new Intl.Segmenter(language,{granularity:'word'}).segment(value.normalize('NFKC'))]
    .filter(part=>part.isWordLike)
    .map(part=>part.segment.normalize('NFKC').toLocaleLowerCase(language));
}
function align(expected,heard){
  const n=expected.length,m=heard.length;
  if(n>450||m>450)throw new Error('voice_transcript_token_limit_exceeded');
  const d=Array.from({length:n+1},()=>new Int32Array(m+1));
  for(let i=0;i<=n;i++)d[i][0]=i;
  for(let j=0;j<=m;j++)d[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
    const sub=expected[i-1]===heard[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j-1]+sub,d[i-1][j]+1,d[i][j-1]+1);
  }
  const changes=[];
  let i=n,j=m;
  while(i>0||j>0){
    if(i>0&&j>0&&expected[i-1]===heard[j-1]){i--;j--;continue;}
    if(i>0&&j>0&&d[i][j]===d[i-1][j-1]+1){
      changes.push({type:'substitution',expected:expected[i-1],recognized:heard[j-1],expectedIndex:i-1});i--;j--;continue;
    }
    if(i>0&&d[i][j]===d[i-1][j]+1){
      changes.push({type:'deletion',expected:expected[i-1],expectedIndex:i-1});i--;continue;
    }
    if(j>0&&d[i][j]===d[i][j-1]+1){
      changes.push({type:'insertion',recognized:heard[j-1],expectedIndex:i});j--;continue;
    }
    throw new Error('voice_transcript_alignment_invariant');
  }
  return {editDistance:d[n][m],changes:changes.reverse()};
}
function phrasePresent(haystack,needle){
  if(!needle.length)return false;
  for(let i=0;i<=haystack.length-needle.length;i++){
    if(needle.every((part,j)=>haystack[i+j]===part))return true;
  }
  return false;
}
/**
 * Compare one external, declared ASR observation with the locked script and
 * the exact produced-audio digest. Does not run an ASR engine, verify the
 * observation's provenance, evaluate true phonetics, or grant release.
 */
export function assessVoiceTranscript({plannedCue,take,observation,maxWordErrorRate=0.05}){
  if(!plannedCue||!filled(plannedCue.text)||!filled(plannedCue.cueId))
    throw new Error('voice_transcript_cast_cue_missing');
  if(!take||!HASH.test(take.artifactDigest??''))
    throw new Error('voice_transcript_take_digest_required');
  if(!Number.isFinite(maxWordErrorRate)||maxWordErrorRate<0||maxWordErrorRate>.25)
    throw new Error('voice_transcript_threshold_invalid');
  const locale=canonical(plannedCue.locale);
  if(!locale)throw new Error('voice_transcript_cast_locale_invalid');
  const faults=[];
  if(observation?.schema!=='evercraft.voice-foundry.asr-observation.v1')
    faults.push('asr_observation_schema_invalid');
  if(observation?.method!=='automated_asr'||!filled(observation?.engineId)||
     !filled(observation?.engineVersion)||!filled(observation?.sourceReceiptRef))
    faults.push('asr_engine_and_receipt_missing');
  if(observation?.audioDigest!==take.artifactDigest)
    faults.push('asr_audio_digest_mismatch');
  if(observation?.cueId!==plannedCue.cueId)
    faults.push('asr_cue_mismatch');
  if(canonical(observation?.locale)!==locale)
    faults.push('asr_locale_mismatch');
  if(!filled(observation?.recognizedText))
    faults.push('asr_recognized_text_missing');
  const digest=crypto.createHash('sha256').update(JSON.stringify({
    cueId:plannedCue.cueId,expectedText:plannedCue.text,takeDigest:take.artifactDigest,
    observation,threshold:maxWordErrorRate
  })).digest('hex');
  if(faults.length){
    return {schema:'evercraft.voice-foundry.transcript-audit.v1',
      cueId:plannedCue.cueId,audioDigest:take.artifactDigest,locale,
      status:'held',reasons:faults,wordErrorRate:null,edits:[],namedTerms:[],
      evidenceDigest:digest,independentAsrProvenanceVerified:false,
      acousticPronunciationVerified:false,humanListeningVerified:false,
      publicationAuthorityGranted:false};
  }
  const expected=tokenize(plannedCue.text,locale);
  const heard=tokenize(observation.recognizedText,locale);
  if(!expected.length||!heard.length)
    throw new Error('voice_transcript_no_recognizable_tokens');
  const {editDistance,changes}=align(expected,heard);
  const namedTerms=(plannedCue.pronunciation??[]).map(term=>{
    const tokens=tokenize(term.term,locale);
    return {term:term.term,presentInTranscript:phrasePresent(heard,tokens)};
  });
  const wordErrorRate=round(editDistance/expected.length);
  const reasons=[];
  if(wordErrorRate>maxWordErrorRate)
    reasons.push('recognized_words_differ_from_locked_script');
  if(namedTerms.some(term=>!term.presentInTranscript))
    reasons.push('named_term_not_recognized');
  return {
    schema:'evercraft.voice-foundry.transcript-audit.v1',
    cueId:plannedCue.cueId,audioDigest:take.artifactDigest,locale,
    status:reasons.length?'needs_human_transcript_review':'candidate_text_match_needs_human_review',
    reasons,expectedTokenCount:expected.length,recognizedTokenCount:heard.length,
    editDistance,wordErrorRate,edits:changes,namedTerms,
    observationReceiptRef:observation.sourceReceiptRef,
    evidenceDigest:digest,
    independentAsrProvenanceVerified:false,
    acousticPronunciationVerified:false,
    humanListeningVerified:false,
    publicationAuthorityGranted:false,
  };
}
