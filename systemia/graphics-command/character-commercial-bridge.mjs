import crypto from 'node:crypto';

const ALLOWED_RIGHTS=new Set(['owned','licensed','permissioned']);
const STYLE_MODES=new Set(['photoreal','animated','claymation']);
const clean=value=>String(value??'').trim();
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function verifiedAsset(asset,kind){
  return Boolean(asset && asset.kind===kind &&
    ALLOWED_RIGHTS.has(asset.rightsState) &&
    /^[a-f0-9]{64}$/i.test(clean(asset.digest)) &&
    Array.isArray(asset.sourceRefs) && asset.sourceRefs.length &&
    clean(asset.locator?.value) && ['url','local'].includes(asset.locator?.kind));
}
export function compileCharacterCommercial(campaign,{style='animated',assets={}}={}){
  if(campaign?.schema!=='evercraft.gravity.character-commercial.v1') throw new Error('character_campaign_schema_invalid');
  if(!STYLE_MODES.has(style)||!campaign.styleTreatments?.[style]) throw new Error('character_style_invalid');
  if(!Array.isArray(campaign.shotPlan)||campaign.shotPlan.length<3) throw new Error('character_shots_missing');
  const cast=new Map((campaign.characters??[]).map(actor=>[actor.id,actor]));
  if(cast.size!==campaign.characters?.length||[...cast.values()].some(actor=>actor.ageClass!=='adult')) throw new Error('character_cast_invalid');
  let start=0; const used=new Set(); const errors=[];
  const shots=campaign.shotPlan.map((shot,index)=>{
    if(used.has(shot.id)) errors.push('duplicate_shot:'+shot.id);
    used.add(shot.id);
    if(!Number.isFinite(shot.durationSec)||shot.durationSec<=0) errors.push('duration_invalid:'+shot.id);
    if(shot.speakerId && shot.speakerId!=='voiceover' && !cast.has(shot.speakerId)) errors.push('speaker_unknown:'+shot.id);
    if(Boolean(shot.line)!==Boolean(shot.speakerId)) errors.push('dialogue_pair_invalid:'+shot.id);
    for(const id of shot.cast??[]) if(!cast.has(id)) errors.push('cast_unknown:'+shot.id+':'+id);
    const result={...shot,index,startSec:Number(start.toFixed(3)),endSec:Number((start+shot.durationSec).toFixed(3)),
      frameStart:Math.round(start*campaign.frameRate),frameEnd:Math.round((start+shot.durationSec)*campaign.frameRate)};
    start+=shot.durationSec;
    return result;
  });
  const requires=['maya_identity','alex_identity','office_environment','forensiscope_actual_ui_capture',
    'maya_voice_license','alex_voice_license','voiceover_voice_license','public_cta_readback'];
  const missing=requires.filter(k=>!assets[k] && !campaign.assetSlots?.[k]);
  const a=Object.fromEntries(requires.map(k=>[k,assets[k]??campaign.assetSlots?.[k]??null]));
  for(const k of ['maya_identity','alex_identity','office_environment']){
    if(!verifiedAsset(a[k],'image')&&!verifiedAsset(a[k],'video')) errors.push('reference_unverified:'+k);
  }
  if(!verifiedAsset(a.forensiscope_actual_ui_capture,'video')) errors.push('real_product_capture_missing');
  for(const k of ['maya_voice_license','alex_voice_license','voiceover_voice_license']){
    if(!a[k]||!ALLOWED_RIGHTS.has(a[k].rightsState)||!clean(a[k].evidenceRef)) errors.push('voice_rights_missing:'+k);
  }
  if(!a.public_cta_readback||a.public_cta_readback.state!=='verified'||!clean(a.public_cta_readback.url)||!clean(a.public_cta_readback.receiptRef)){
    errors.push('public_cta_not_verified');
  }
  if(Math.abs(start-campaign.runtimeSec)>.001) errors.push('runtime_mismatch');
  if(campaign.frameRate!==24) errors.push('frame_rate_unsupported');
  if(campaign.publicationAuthority!==false||campaign.paidGenerationAuthority!==false) errors.push('authority_not_fail_closed');
  const input={
    schema:'evercraft.fallen.cinematic-sequence-input.v1',id:campaign.id+'-'+style,
    aspectRatio:'9:16',continuityDigest:hash({campaignId:campaign.id,style,cast:[...cast.keys()],location:campaign.locationId}),
    identityReferences:Object.fromEntries([...cast.keys()].map(id=>{
      const ref=a[id+'_identity'];return [id,verifiedAsset(ref,'image')||verifiedAsset(ref,'video')?[{id:id+'-identity',kind:ref.kind,role:'identity',digest:ref.digest,sourceRefs:ref.sourceRefs,locator:ref.locator}]:[]];
    })),
    environmentReferences:{[campaign.locationId]:verifiedAsset(a.office_environment,'image')||verifiedAsset(a.office_environment,'video')
      ? [{id:'office-env',kind:a.office_environment.kind,role:'environment',digest:a.office_environment.digest,sourceRefs:a.office_environment.sourceRefs,locator:a.office_environment.locator}]:[]},
    shots:shots.map(s=>({
      id:s.id,needId:campaign.id+':'+s.id,locationId:campaign.locationId,durationSec:s.durationSec,
      shotScale:s.shotScale,lensMm:s.lensMm,cameraMovement:'locked',screenDirection:'neutral',
      prompt:[s.action,campaign.styleTreatments[style].visual,campaign.styleTreatments[style].motion,
        s.id==='S05'?'MANDATORY: composite authentic ForensiScope UI capture, do not synthesize app screen.':'',
        s.line?'Dialogue exactly: '+s.line:''].filter(Boolean).join(' '),
      sourceRefs:campaign.sourceRefs,characters:s.cast.map((id,i)=>({
        entityId:id,startZone:id==='maya'?'left':'right',startFacing:id==='maya'?'right':'left',
        eyeline:id==='maya'?'camera_right':'camera_left',action:s.action,
        propIds:['laptop']})),...((s.speakerId&&s.speakerId!=='voiceover')?{dialogue:{speakerId:s.speakerId}}:{})
    }))
  };
  return {schema:'evercraft.gravity.character-commercial-bridge.v1',campaignId:campaign.id,
    style,shots,totalSec:Number(start.toFixed(3)),frameCount:Math.round(start*campaign.frameRate),
    cinematicSequenceInput:input,missingAssets:missing,
    issues:[...new Set(errors)],status:errors.length?'blocked':'preflight_ready',
    voiceExecutionState:'not_requested',renderExecutionState:'not_requested',
    publicationAuthority:false,paidGenerationAuthority:false,
    nextStage:'Apply Fallen cinematic-sequence and performance director contracts; generate only with separately authorized licensed providers, then verify identity, dialogue sync, real UI and release gates.'};
}
