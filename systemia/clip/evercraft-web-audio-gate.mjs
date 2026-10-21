/**
 * Fail-closed sound quality and rights gate for Evercraft Web launch assets.
 * DSP metrics (LUFS/LRA/peak) NEVER constitute human acoustic approval.
 * Source hashes below identify auditions from the October 20 review package.
 */
export const NON_APPROVED_SOURCES=Object.freeze({
  "994fc583ff6b89a7778940fc1ce3f1008ceba5da17b58de2248facb72bf9297c":"audition_A_not_approved",
  "e2d0038fb47155859f5a3b76d8453e7e0140967af7e649a02cf25d7ec5175ae0":"audition_B_not_approved",
  "a9081e0131311057a9a05ae9075cd80897486c43f89a73a3c7f6783321acedee":"audition_C_not_approved"
});

const sha256=/^[a-f0-9]{64}$/i;
const approved=(x)=>x?.listening_review?.decision==="approved" &&
  typeof x.listening_review.reviewed_by==="string" &&
  x.listening_review.reviewed_by.trim().length>0 &&
  typeof x.listening_review.reviewed_at==="string" &&
  Number.isFinite(Date.parse(x.listening_review.reviewed_at));

export function assessCommercialAudio(packet){
  const reasons=[];
  if(!packet || packet.schema!=="evercraft.clip.audio-approval.v1"){
    return {release_authorized:false,status:"HOLD",reasons:["packet_missing_or_wrong_schema"]};
  }
  for(const category of ["music","voice","sfx"]){
    const asset=packet[category];
    if(asset===null && packet.intentional_silence?.includes(category)){
      if(!approved(packet.silence_review?.[category]))reasons.push(category+":silence_unapproved");
      continue;
    }
    if(!asset || typeof asset!=="object"){
      reasons.push(category+":missing");continue;
    }
    if(!sha256.test(asset.sha256||""))reasons.push(category+":sha256_missing");
    else if(NON_APPROVED_SOURCES[String(asset.sha256).toLowerCase()]){
      reasons.push(category+":previously_rejected_or_not_approved");
    }
    if(asset.rights_state!=="commercial_cleared")reasons.push(category+":commercial_rights_unverified");
    if(!approved(asset))reasons.push(category+":no_human_listening_approval");
  }
  // A true result is merely an audio evidence gate pass, never release/publishing authority.
  return {release_authorized:false,
    audio_gate_passed:reasons.length===0,
    status:reasons.length===0?"AUDIO_REVIEW_PASSED_NOT_PUBLISHED":"HOLD",
    reasons
  };
}
