/**
 * Only security-relevant audio state belongs in this fingerprint.
 * The digest identifies bytes, but rights, source refs and session ownership
 * must also be part of the authorization boundary.
 *
 * This is an invalidation signature, NOT a cryptographic permission proof.
 */
export function pulseGridAudioAuthoritySignature(session){
  if(!session||typeof session.session_id!=='string'||!Array.isArray(session.assets)||
     !Array.isArray(session.tracks))throw new Error('Canonical audio session required');
  const assets=session.assets.map(a=>[
    a.id,a.digest,a.byte_length,a.mime_type,a.rights,a.source_state,
    [...(a.source_refs||[])].sort(),
  ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const clips=session.tracks.map(t=>[
    t.id,t.type,t.clips.map(c=>{
      const patch=c.provenance?.foundry_piano_patch||null;
      // A new sampled MIDI note can require a newly authorized asset.
      const expression=patch?c.notes.map(n=>[n.id,n.pitch,n.velocity,n.start,n.length]):null;
      return [c.audio_asset_id||null,patch,expression,patch?(c.provenance?.foundry_piano_pedal||[]):null];
    })
  ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([session.session_id,assets,clips]);
}
