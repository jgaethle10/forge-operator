import crypto from 'node:crypto';

const s = value => typeof value === 'string' && value.trim().length > 0;
const fail = reason => { throw new Error('systemia_voice_handoff_'+reason); };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Read-only bridge from a real, already compiled Fallen Studio Draft to the
 * Voice Foundry session input defined on the separate review branch #1465.
 * No synthesized voices, invented profiles, approvals, speech audio, or
 * source admission. This intentionally returns HELD until an actual caster
 * and rights reviewer provides qualified identity evidence.
 */
export function prepareVoiceFoundryHandoff(bundle) {
  if (bundle?.schema !== 'evercraft.fallen.studio-draft-bundle.v1') fail('bundle_schema_invalid');
  if (!s(bundle.project?.id)) fail('project_id_missing');
  if (bundle.boundaries?.publicationAuthorityGranted !== false ||
      bundle.boundaries?.paidGenerationAuthorityGranted !== false) fail('authority_boundary_invalid');
  if (!Array.isArray(bundle.script) || !bundle.script.length) fail('script_missing');
  if (!Array.isArray(bundle.productionNeeds)) fail('production_needs_missing');
  const byNeedId = new Map(bundle.productionNeeds.map(need=>[need.id,need]));
  if (byNeedId.size !== bundle.productionNeeds.length) fail('production_need_duplicate');
  const voiceTrack = bundle.project.tracks?.find(track=>track.kind==='voice');
  if (!voiceTrack || !Array.isArray(voiceTrack.clips)) fail('voice_track_missing');
  const available = new Map(voiceTrack.clips.map(clip=>[clip.id,clip]));
  if (available.size !== voiceTrack.clips.length) fail('voice_clip_duplicate');

  const cues = bundle.script.map(line=>{
    const id = `${bundle.project.id}-${line.sceneId}-speech`;
    const need = byNeedId.get(id);
    if (!need || need.kind!=='speech') fail('matching_need_missing:'+id);
    if (!s(line.text) || !s(line.speakerId)) fail('line_identity_missing:'+id);
    if (line.text !== need.prompt || line.speakerId !== need.speakerId) fail('line_to_need_mismatch:'+id);
    if (line.voiceProfileId || need.voiceProfileId) fail('already_cast_must_use_approved_path:'+id);
    if (!Number.isFinite(need.durationSec) || need.durationSec<=0) fail('duration_invalid:'+id);
    if (!Number.isFinite(line.durationSec) || Math.abs(line.durationSec-need.durationSec)>0.0001) fail('duration_drift:'+id);
    const clip = available.get(line.sceneId+'-voice');
    if (!clip || clip.assetId!=='asset-'+id ||
        Math.abs(clip.startSec-line.startSec)>0.0001 ||
        Math.abs(clip.durationSec-line.durationSec)>0.0001) fail('voice_timeline_mismatch:'+id);
    if (!Array.isArray(need.requires) || !['commercial_rights','provenance_receipt','timing_control'].every(r=>need.requires.includes(r))) fail('production_requirements_missing:'+id);
    const locale = line.language === 'en' ? 'en-US' : line.language;
    if (!s(locale)) fail('locale_missing:'+id);
    try{Intl.getCanonicalLocales(locale)}catch{fail('locale_invalid:'+id)}
    return {
      id,
      sceneId:line.sceneId,
      speakerId:line.speakerId,
      voiceProfileId:null,
      locale,
      accent:null,
      text:line.text,
      direction:null,
      performance:null,
      maxDurationSec:line.durationSec,
      timelineStartSec:line.startSec,
      castingState:'awaiting_human_audition_and_rights_evidence',
      productionNeedId:need.id
    };
  });
  if (cues.length !== bundle.productionNeeds.filter(n=>n.kind==='speech').length ||
      cues.length !== voiceTrack.clips.length) fail('speech_coverage_incomplete');
  if (new Set(cues.map(c=>c.id)).size !== cues.length) fail('cue_duplicate');
  const speakers = [...new Set(cues.map(c=>c.speakerId))].sort();
  if (!speakers.includes('human-owner') || !speakers.includes('ai-agent')) fail('two_roles_missing');
  const foundry = {
    schema:'evercraft.voice-foundry.session.v1',
    profiles:[],
    cues:cues.map(c=>({
      id:c.id,speakerId:c.speakerId,voiceProfileId:c.voiceProfileId,
      locale:c.locale,accent:c.accent,text:c.text,direction:c.direction,
      performance:c.performance,maxDurationSec:c.maxDurationSec
    })),
    lexicon:[],
    previousCast:[]
  };
  const receipt = {
    schema:'evercraft.graphics-command.voice-foundry-handoff-receipt.v1',
    projectId:bundle.project.id,
    cueCount:cues.length,
    speakerRoles:speakers,
    cueDigest:hash(foundry.cues),
    status:'held_cast_and_rights_required',
    castApproved:false,
    auditionCompleted:false,
    audioMeasured:false,
    paidGenerationAuthority:false,
    publicationAuthority:false
  };
  return {foundry,cues,receipt};
}
