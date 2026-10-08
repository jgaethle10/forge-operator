import {publishSpaceDudzCandidateFacebook,loadSpaceDudzCampaign} from './space-dudz-facebook-publish.mjs';

const clean=value=>String(value??'').trim();
export const SPACE_DUDZ_RESIDENT_STATE_SCHEMA='evercraft.clip.space-dudz-resident-state.v1';

export function emptySpaceDudzResidentState(){
  return {schema:SPACE_DUDZ_RESIDENT_STATE_SCHEMA,cycle_count:0,candidates:{}};
}
function normalizeState(value){
  return value?.schema===SPACE_DUDZ_RESIDENT_STATE_SCHEMA
    ? {schema:SPACE_DUDZ_RESIDENT_STATE_SCHEMA,cycle_count:Number(value.cycle_count||0),candidates:structuredClone(value.candidates||{})}
    : emptySpaceDudzResidentState();
}

export async function runSpaceDudzPublishCycle({
  repoRoot,
  campaignPath,
  credentialStateDir,
  inputState=emptySpaceDudzResidentState(),
  authorize=async()=>({decision:'deny',reason:'authorization_checker_missing'}),
  publisher=publishSpaceDudzCandidateFacebook,
  now=()=>new Date().toISOString(),
  maxPublishesPerCycle=1,
}={}){
  const state=normalizeState(inputState);
  const {campaign}=loadSpaceDudzCampaign(repoRoot,campaignPath);
  const observedAt=now();
  const events=[];
  let providerPublishes=0;

  for(const candidate of campaign.candidates){
    const id=clean(candidate.id);
    const previous=state.candidates[id]||null;
    if(previous?.state==='published'){
      events.push({candidate_id:id,action:'skip_terminal',state:'published',remote_id:previous.remote_id||null});
      continue;
    }
    if(providerPublishes>=Math.max(1,Number(maxPublishesPerCycle)||1)){
      events.push({candidate_id:id,action:'hold_cycle_limit',state:'pending'});
      continue;
    }

    let authorization;
    try{
      authorization=await authorize({
        scope:'home.clip.publish',
        resource_ref:'brand:space-dudz',
        candidate_id:id,
        campaign_id:clean(campaign.campaign_id),
      });
    }catch(error){
      authorization={decision:'deny',reason:error instanceof Error?error.message:String(error)};
    }
    if(authorization?.decision!=='allow'){
      const reason=clean(authorization?.reason)||'space_dudz_publish_not_authorized';
      state.candidates[id]={state:'authorization_hold',last_error:reason,last_attempt_at:observedAt,attempt_count:Number(previous?.attempt_count||0)+1};
      events.push({candidate_id:id,action:'authorization_hold',state:'authorization_hold',error:reason});
      continue;
    }

    let receipt;
    try{
      receipt=await publisher({
        repoRoot,campaign,candidate,credentialStateDir,
        authorizationRef:clean(authorization.grant_id)?'passport-grant:'+clean(authorization.grant_id):'passport:home.clip.publish',
      });
    }catch(error){
      receipt={status:'failed',error:error instanceof Error?error.message:String(error)};
    }

    const published=receipt?.status==='published';
    if(published) providerPublishes+=1;
    state.candidates[id]={
      state:clean(receipt?.status)||'failed',
      remote_id:clean(receipt?.remoteId)||null,
      post_url:clean(receipt?.url)||null,
      media_sha256:clean(receipt?.mediaSha256)||null,
      last_error:clean(receipt?.error)||null,
      last_attempt_at:observedAt,
      published_at:published?clean(receipt?.publishedAt)||observedAt:null,
      attempt_count:Number(previous?.attempt_count||0)+1,
      provider_published:published,
    };
    events.push({candidate_id:id,action:published?'provider_published':'attempt_failed',state:state.candidates[id].state,remote_id:state.candidates[id].remote_id});
  }

  state.cycle_count+=1;
  state.observed_at=observedAt;
  const values=Object.values(state.candidates);
  return {
    schema:'evercraft.clip.space-dudz-resident-cycle.v1',
    state,
    snapshot:{
      observed_at:observedAt,
      campaign_id:clean(campaign.campaign_id),
      poll_id:clean(campaign.poll_id),
      cycle_count:state.cycle_count,
      candidate_count:campaign.candidates.length,
      published:values.filter(x=>x.state==='published').length,
      failed:values.filter(x=>x.state==='failed').length,
      authorization_holds:values.filter(x=>x.state==='authorization_hold').length,
      provider_publishes_this_cycle:providerPublishes,
      events,
      boundaries:{
        spaceDudzOnly:true,
        maxProviderPublishesPerCycle:Math.max(1,Number(maxPublishesPerCycle)||1),
        terminalProviderReceiptsNeverRepublished:true,
        passportAuthorizationRequired:true,
        resourceAuthorizationRequired:true,
        credentialsResolvedOnlyAfterAuthorization:true,
        rnbChickenAndSoulExcluded:true,
        voteIsPreferenceSignal:true,
        preorderRequiredBeforePrint:true,
      },
    },
  };
}
