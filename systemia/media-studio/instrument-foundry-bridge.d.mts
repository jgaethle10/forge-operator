import type {PulseGridAudioAsset, PulseGridSession, PulseGridTransactionInput} from './pulsegrid-session.js';

export type FoundryCandidateAsset = PulseGridAudioAsset & {
  release_ready?: boolean;
  commercial_rights_verified?: boolean;
};

export function compileFoundryImport(input:{
  session: PulseGridSession;
  assets: FoundryCandidateAsset[];
  attachments: Array<{track_id:string;scene:number;asset_id:string}>;
  actor?: 'human' | 'agent';
}):{
  actor:'human'|'agent';
  transaction:PulseGridTransactionInput;
  custody:{
    assets:string[];
    unknown_rights:string[];
    release_ready:false;
    execution_state:'CANDIDATE_NOT_COMMITTED';
    playback_verified:false;
    note:string;
  };
};

export function verifyFoundryWavBytes(
  asset: Pick<PulseGridAudioAsset,'digest'|'byte_length'|'sample_rate'|'channels'>,
  bytes:Uint8Array|ArrayBuffer,
  subtle?:SubtleCrypto,
):Promise<{
  verified:true;
  digest:string;
  channels:number;
  sample_rate:number;
  bytes:number;
}>;
