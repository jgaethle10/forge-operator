/**
 * Evercraft Instrument Foundry -> canonical PulseGrid transaction compiler.
 * Read-only planning: no audio playback, storage mutation, grant, or commercial release.
 * The canonical PulseGrid applyPulseGridTransaction owns actual mutation.
 */
const SHA256=/^[a-f0-9]{64}$/;
const RIGHTS=new Set(['owned','licensed','unknown','restricted']);
const SOURCES=new Set(['recording','imported','generated','bounce']);
const SCHEMA='evercraft.fallen.pulsegrid.session.v1';

export function compileFoundryImport({session,assets,attachments,actor='human'}){
  if(!session||session.schema!==SCHEMA||!Array.isArray(session.assets)||!Array.isArray(session.tracks)){
    throw new Error('A canonical PulseGrid session snapshot is required');
  }
  if(!['human','agent'].includes(actor))throw new Error('Invalid actor');
  if(!Array.isArray(assets)||!assets.length||assets.length>128)throw new Error('Invalid audio asset batch');
  if(!Array.isArray(attachments))throw new Error('Explicit target attachments are required');
  const existing=new Map(session.assets.map(a=>[a.id,a]));
  const pending=new Map();
  for(const a of assets){
    if(!a||typeof a!=='object'||typeof a.digest!=='string'||!SHA256.test(a.digest)){
      throw new Error('Invalid SHA-256 asset');
    }
    if(a.id!=='audio-sha256:'+a.digest||a.kind!=='audio')throw new Error('Asset identity does not match digest');
    if(a.mime_type!=='audio/wav'||!Number.isSafeInteger(a.byte_length)||a.byte_length<44||
      !Number.isFinite(a.duration_sec)||a.duration_sec<=0||a.duration_sec>1800||
      ![44100,48000,96000].includes(a.sample_rate)||![1,2].includes(a.channels)){
      throw new Error('Invalid audio recording metadata');
    }
    if(!RIGHTS.has(a.rights)||a.rights==='restricted')throw new Error('Restricted or unclassified recording cannot be imported');
    if(!SOURCES.has(a.source_state))throw new Error('Invalid audio source state');
    if(!Array.isArray(a.source_refs)||!a.source_refs.length||
      a.source_refs.some(x=>typeof x!=='string'||!/^sha256:[a-f0-9]{64}$/.test(x))){
      throw new Error('Missing immutable sample provenance');
    }
    if(a.release_ready===true||a.commercial_rights_verified===true)throw new Error('Foundry cannot self-certify a release');
    if(pending.has(a.id))throw new Error('Duplicate asset');
    if(existing.has(a.id)){
      const prev=existing.get(a.id);
      if(prev.digest!==a.digest||prev.rights!==a.rights||prev.byte_length!==a.byte_length||
        JSON.stringify(prev.source_refs)!==JSON.stringify(a.source_refs)){
        throw new Error('Asset custody or rights conflict');
      }
    }
    pending.set(a.id,a);
  }
  if(attachments.length>64)throw new Error('Too many audio attachments');
  const targets=new Set();
  for(const b of attachments){
    const track=session.tracks.find(t=>t.id===b.track_id);
    if(!track||track.type!=='audio')throw new Error('Only existing audio tracks may receive Foundry assets');
    if(!Number.isInteger(b.scene)||b.scene<0||b.scene>=track.clips.length)throw new Error('Invalid scene index');
    if(!pending.has(b.asset_id))throw new Error('Attachment references unverified batch asset');
    const target=b.track_id+':'+b.scene;
    if(targets.has(target))throw new Error('Duplicate audio clip target');
    targets.add(target);
    if(track.clips[b.scene].audio_asset_id&&track.clips[b.scene].audio_asset_id!==b.asset_id){
      throw new Error('Existing clip audio cannot be silently overwritten');
    }
  }
  const operations=[
    ...[...pending.values()].filter(a=>!existing.has(a.id)).map(a=>({
      type:'asset.register_audio',
      asset:Object.fromEntries(['digest','mime_type','byte_length','duration_sec','sample_rate','channels',
        'source_name','source_refs','source_state','rights','parent_asset_ids','created_at']
        .map(k=>[k,a[k]]).filter(([,v])=>v!==undefined))
    })),
    ...attachments.map(({track_id,scene,asset_id})=>({type:'clip.attach_audio_asset',track_id,scene,asset_id}))
  ];
  if(!operations.length||operations.length>128)throw new Error('No admissible transaction');
  return {actor,transaction:{intent:'Import Foundry WAV audition (not commercial clearance)',operations},
    custody:{assets:[...pending.keys()],unknown_rights:[...pending.values()].filter(a=>a.rights==='unknown').map(a=>a.id),
      release_ready:false,execution_state:'CANDIDATE_NOT_COMMITTED',playback_verified:false,
      note:'Verify actual WAV bytes via verifyFoundryWavBytes before executing the canonical PulseGrid transaction.'}};
}

/** Independent byte custody gate. Manifest assertions alone are not proof. */
export async function verifyFoundryWavBytes(asset,input,subtle=globalThis.crypto?.subtle){
  if(!subtle)throw new Error('Cryptographic hash implementation required');
  const bytes=input instanceof ArrayBuffer?new Uint8Array(input):input;
  if(!(bytes instanceof Uint8Array))throw new Error('WAV data must be Uint8Array or ArrayBuffer');
  if(bytes.byteLength<44||bytes.byteLength!==asset.byte_length)throw new Error('Recording byte length mismatch');
  const b=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const fourcc=o=>String.fromCharCode(...bytes.subarray(o,o+4));
  if(fourcc(0)!=='RIFF'||fourcc(8)!=='WAVE')throw new Error('Not a RIFF/WAVE recording');
  if(b.getUint32(4,true)+8!==bytes.byteLength)throw new Error('RIFF byte length mismatch');
  let offset=12,fmt=null,hasData=false;
  while(offset+8<=bytes.byteLength){
    const id=fourcc(offset),size=b.getUint32(offset+4,true);
    if(size>bytes.byteLength-offset-8)throw new Error('Malformed WAV chunk size');
    if(id==='fmt '){
      if(size<16)throw new Error('Malformed WAV fmt chunk');
      fmt={format:b.getUint16(offset+8,true),channels:b.getUint16(offset+10,true),sampleRate:b.getUint32(offset+12,true)};
    }
    if(id==='data'&&size>0)hasData=true;
    offset+=8+size+(size%2);
  }
  if(!fmt||!hasData||![1,3].includes(fmt.format))throw new Error('Unsupported or empty PCM/float WAV');
  if(fmt.channels!==asset.channels||fmt.sampleRate!==asset.sample_rate){
    throw new Error('WAV audio format disagrees with manifest');
  }
  const digest=[...new Uint8Array(await subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.digest)throw new Error('WAV SHA-256 mismatch');
  return {verified:true,digest,channels:fmt.channels,sample_rate:fmt.sampleRate,bytes:bytes.byteLength};
}
