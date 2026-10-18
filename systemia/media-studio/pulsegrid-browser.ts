export {
  PULSEGRID_ARRANGEMENT_BARS,
  PULSEGRID_ENGINE_VERSION,
  PULSEGRID_MAX_CLIP_BARS,
  PULSEGRID_SESSION_SCHEMA,
  PULSEGRID_STEPS_PER_BAR,
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  migratePulseGridSession,
  pulseGridAudioAssetId,
  undoPulseGridReceipt,
  validatePulseGridSession,
} from './pulsegrid-session.js';

export type {
  PulseGridActor,
  PulseGridAudioAsset,
  PulseGridAudioAssetInput,
  PulseGridAudioAssetRights,
  PulseGridAudioAssetSourceState,
  PulseGridClip,
  PulseGridNote,
  PulseGridOperation,
  PulseGridReceipt,
  PulseGridSession,
  PulseGridTrack,
  PulseGridTransactionInput,
  PulseGridTransactionRequest,
} from './pulsegrid-session.js';

export { PulseGridAudioEngine } from './pulsegrid-audio.js';
export type { PulseGridAudioStatus } from './pulsegrid-audio.js';

export { PulseGridBrowserAudioAssetVault, pulseGridSha256Hex } from './pulsegrid-asset-vault.js';
export type { PulseGridAudioAssetIngestOptions } from './pulsegrid-asset-vault.js';

// Explicit, opt-in signed recording review. Does not authorize commercial rights.
export { verifyBrowserRecordedAudio, recordedAudioReviewPayload } from './recorded-audio-browser-custody.mjs';
export type { RecordedAudioReviewedAsset, BrowserRecordedAudioReviewReceipt } from './recorded-audio-browser-custody.mjs';
