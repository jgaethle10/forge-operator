// Opt-in contract for cinematic, human-led commercials. Planning gate only.
// No metadata-only check establishes that a performance, model release, or a finished mix is good.
const VIDEO_RIGHTS = new Set(['owned', 'licensed']);
const OBSERVED_STATES = new Set(['observed', 'licensed']);
const HUMAN_SUBJECTS = new Set(['visible-human-action', 'speaking-human']);
const REQUIRED_AUDIO = ['dialogue', 'score', 'foley', 'ambience'];

function requirePart(value, reason) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('relay_floor_' + reason);
}
export function assertRelayFloorBrief(brief) {
  if (brief?.creativeStandard !== 'relay-floor-v1') return;
  const scenes = brief.scenes || [];
  const assets = new Map((brief.sourceAssets || []).map(asset => [asset.id, asset]));
  if (scenes.length < 5) throw new Error('relay_floor_minimum_five_moving_shots');
  let humanShots = 0;
  let onScreenSpeech = 0;
  const effects = new Set();
  const energies = [];
  for (const scene of scenes) {
    const asset = assets.get(scene.assetId);
    if (!asset || asset.mediaKind !== 'video') {
      throw new Error('relay_floor_still_photo_substitution:' + scene.id);
    }
    if (!VIDEO_RIGHTS.has(asset.rights) || !OBSERVED_STATES.has(asset.evidenceState)) {
      throw new Error('relay_floor_unapproved_visual_source:' + scene.id);
    }
    if (asset.motionType !== 'physical_action') {
      throw new Error('relay_floor_physical_action_not_attested:' + scene.id);
    }
    const subjects = scene.mustShowSubjects || [];
    if (subjects.some(s => HUMAN_SUBJECTS.has(s))) humanShots++;
    if (scene.onScreenDialogue) {
      if (!subjects.includes('speaking-human') || !(asset.subjects || []).includes('speaking-human')) {
        throw new Error('relay_floor_on_screen_speaker_not_evidenced:' + scene.id);
      }
      requirePart(scene.onScreenDialogue.text, 'spoken_text_missing:' + scene.id);
      requirePart(scene.onScreenDialogue.syncAudioAssetRef, 'synchronized_dialogue_audio_missing:' + scene.id);
      requirePart(scene.onScreenDialogue.performerUseConsentRef, 'performer_use_consent_missing:' + scene.id);
      onScreenSpeech++;
    }
    if (asset.footageClass === 'illustrative_stock') {
      if (asset.modelOrTalentReleaseStatus !== 'reviewed_for_this_ad') {
        throw new Error('relay_floor_stock_talent_review_missing:' + scene.id);
      }
    } else if (asset.footageClass !== 'verified_eps_project') {
      throw new Error('relay_floor_footage_class_unverified:' + scene.id);
    }
    for (const effect of scene.sfxCues || []) {
      requirePart(effect.description, 'foley_cue_missing:' + scene.id);
      effects.add(effect.description.trim().toLowerCase());
    }
    energies.push(Number(scene.scoreEnergy));
  }
  if (humanShots < 2) throw new Error('relay_floor_people_shots_missing');
  if (!onScreenSpeech) throw new Error('relay_floor_on_screen_talking_missing');
  if (effects.size < 3) throw new Error('relay_floor_layered_foley_missing');
  if (energies.some(n => !Number.isFinite(n)) || Math.max(...energies) - Math.min(...energies) < 0.25) {
    throw new Error('relay_floor_dynamic_score_arc_missing');
  }
  const audio = brief.audioDirection || {};
  for (const role of REQUIRED_AUDIO) requirePart(audio[role], 'audio_direction_missing:' + role);
  requirePart(audio.voicePerformanceDirection, 'voice_performance_direction_missing');
  requirePart(audio.mixDirection, 'mix_direction_missing');
  // These are declarations, not proof. Rights, audio takes and final visual/audio QC
  // must be independently inspected downstream before commercial delivery.
}
