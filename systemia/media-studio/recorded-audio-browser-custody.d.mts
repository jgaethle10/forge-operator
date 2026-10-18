import type {PulseGridAudioAsset} from './pulsegrid-session.js';

export interface RecordedAudioReviewedAsset {
  assetId:string;
  relativePath:string;
  sha256:string;
  licenseId:'CC0-1.0'|'CC-BY-4.0'|'LicenseRef-Evercraft-Owned';
  sourceUrl:string;
  licenseEvidenceUrl:string;
  attribution?:string;
  review:{
    schema:'evercraft.fallen.recorded-audio-review.v1';
    decision:'approved';
    reviewedBy:string;
    reviewedAt:string;
    signature:string;
  };
}
export interface BrowserRecordedAudioReviewReceipt {
  schema:'evercraft.fallen.browser-recorded-audio-review.v1';
  status:'accepted_for_ingest_review';
  sha256:string;
  assetId:string;
  sourceRefs:string[];
  sourceName:string;
  rights:'unknown';
  publicationAuthorized:false;
}
export const BROWSER_CUSTODY_SCHEMA:'evercraft.fallen.recorded-audio-custody.v1';
export const BROWSER_REVIEW_SCHEMA:'evercraft.fallen.recorded-audio-review.v1';
export function recordedAudioReviewPayload(asset:RecordedAudioReviewedAsset):{
  domain:string;assetId:string;sha256:string;licenseId:string;sourceUrl:string;
  licenseEvidenceUrl:string;attribution:string;decision:string;reviewedBy:string;reviewedAt:string;
};
export function verifyBrowserRecordedAudio(blob:Blob,asset:RecordedAudioReviewedAsset,pinnedReviewerPublicKeyPem:string):Promise<BrowserRecordedAudioReviewReceipt>;
export function ingestReviewedRecordingIntoVault(
  vault:{ingest(blob:Blob,options:{source_name:string;source_refs:string[];source_state:'imported';rights:'unknown'}):Promise<PulseGridAudioAsset>},
  blob:Blob,
  asset:RecordedAudioReviewedAsset,
  pinnedReviewerPublicKeyPem:string,
):Promise<{asset:PulseGridAudioAsset;receipt:BrowserRecordedAudioReviewReceipt}>;