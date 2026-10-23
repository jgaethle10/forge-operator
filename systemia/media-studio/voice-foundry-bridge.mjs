import { planVoiceSession } from './voice-foundry.mjs';

function deny(reason) { throw new Error(`voice_foundry_preflight_blocked:${reason}`); }
function isText(value) { return typeof value === 'string' && value.trim().length > 0; }

/**
 * Validate an individual, existing Fallen ProductionNeed against a separately
 * approved Voice Foundry cast before any billed provider work begins.
 *
 * This bridge does NOT synthesize speech, grant usage rights, make network
 * calls, approve audio quality or change the production admission policy.
 */
export function preflightVoiceFoundrySpeech({ need, foundry, configuredVoiceId, provider='elevenlabs', verified=false, commercialRights='unknown' }) {
  if (!foundry || typeof foundry !== 'object') deny('casting_config_missing');
  if (need?.kind !== 'speech') deny('speech_need_required');
  if (!verified) deny('provider_not_verified');
  if (commercialRights !== 'allowed') deny('provider_commercial_rights_not_cleared');
  if (!isText(need?.voiceProfileId)) deny('production_voice_profile_missing');
  if (!isText(need?.speakerId)) deny('production_speaker_missing');
  if (!Array.isArray(need?.requires) || !['voice_profile','commercial_rights','provenance_receipt','timing_control'].every(x=>need.requires.includes(x))) deny('production_requirements_incomplete');
  if (!Array.isArray(foundry.cues) || !Array.isArray(foundry.profiles)) deny('casting_catalog_invalid');
  const matched=foundry.cues.filter(cue=>cue?.id===need.id);
  if (matched.length !== 1) deny('unique_cue_binding_missing');
  const cue=matched[0];
  if (cue.voiceProfileId!==need.voiceProfileId) deny('cast_profile_mismatch');
  if (cue.speakerId!==need.speakerId) deny('cast_speaker_mismatch');
  if (cue.text!==need.prompt) deny('spoken_text_mismatch');
  if (need.durationSec !== undefined && (!Number.isFinite(need.durationSec) || need.durationSec <= 0 || !Number.isFinite(cue.maxDurationSec) || need.durationSec>cue.maxDurationSec)) deny('cue_window_mismatch');
  // Validate the whole scene cast, not just the requested cue, so speaker drift
  // cannot be hidden in a second scene of the same generation session.
  const session=planVoiceSession({profiles:foundry.profiles,cues:foundry.cues,lexicon:foundry.lexicon??[],previousCast:foundry.previousCast??[]});
  const planned=session.cues.find(candidate=>candidate.cueId===need.id);
  if (session.status !== 'ready_for_authorized_generation' || !planned || planned.status !== 'ready_for_authorized_generation') {
    const causes=[...(planned?.reasons??[]),...(session.continuity?.reasons??[])];
    deny('cast_not_approved:'+(causes.length?causes.join(','):'another_scene_cast_held'));
  }
  if (planned.provider!==provider) deny('cast_provider_mismatch');
  if (planned.providerVoiceId!==configuredVoiceId || !isText(configuredVoiceId)) deny('configured_voice_id_mismatch');
  // BCP-47 locale is editorial identity; the TTS endpoint uses the base language.
  const locale=new Intl.Locale(planned.locale);
  if (need.language) {
    let language;
    try { language=new Intl.Locale(need.language).language; } catch { deny('production_language_invalid'); }
    if (language!==locale.language) deny('production_language_mismatch');
  }
  return Object.freeze({
    cueId:planned.cueId,
    voiceProfileId:planned.voiceProfileId,
    providerVoiceId:planned.providerVoiceId,
    identityVersion:planned.identityVersion,
    locale:planned.locale,
    languageCode:locale.language,
    accent:planned.accent,
    direction:planned.direction,
    performance:planned.performance,
    pronunciation:planned.pronunciation,
    planDigest:planned.planDigest,
    status:'ready_for_authorized_generation',
    qualityApproved:false,
    publicationAuthorityGranted:false,
  });
}
