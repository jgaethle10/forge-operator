import fs from 'node:fs';
import path from 'node:path';
import { publishCfbJournalToFacebook } from '../newsroom/cfb-clip-facebook-publish.mjs';
import { resolveFacebookPageCredential } from './facebook-page-credential-resolver.mjs';
import { journalStoryResourceRef } from '../evercraft-home/clip-journal-publish-adapter.mjs';

export const CFB_CLIP_RESIDENT_STATE_SCHEMA='evercraft.clip.cfb-journal-resident-state.v1';

function clean(value){ return String(value??'').trim(); }

export function emptyCfbClipResidentState(){
  return {
    schema:CFB_CLIP_RESIDENT_STATE_SCHEMA,
    cycle_count:0,
    stories:{},
  };
}

function normalizeState(value){
  if(value?.schema!==CFB_CLIP_RESIDENT_STATE_SCHEMA) return emptyCfbClipResidentState();
  return {
    schema:CFB_CLIP_RESIDENT_STATE_SCHEMA,
    cycle_count:Number.isInteger(value.cycle_count)?value.cycle_count:0,
    stories:value.stories&&typeof value.stories==='object'&&!Array.isArray(value.stories)
      ?structuredClone(value.stories)
      :{},
  };
}

export function discoverCfbJournalHandoffs(journalRoot){
  const productionRoot=path.resolve(journalRoot,'production');
  if(!fs.existsSync(productionRoot)) return [];
  const rows=[];
  for(const entry of fs.readdirSync(productionRoot,{withFileTypes:true})){
    if(!entry.isDirectory()) continue;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    const file=path.resolve(productionRoot,entry.name,'clip-handoff.json');
    if(!file.startsWith(productionRoot+path.sep)||!fs.existsSync(file)) continue;
    let handoff;
    try{ handoff=JSON.parse(fs.readFileSync(file,'utf8')); }
    catch{ continue; }
    if(handoff?.schema!=='evercraft.clip.journal-handoff.v1') continue;
    if(!clean(handoff.story_id).includes('cfb-power-rankings')) continue;
    if(clean(handoff.slug)!==entry.name) continue;
    if(handoff.publication_authority!==false) continue;
    rows.push({file,slug:entry.name,handoff});
  }
  return rows.sort((a,b)=>clean(a.handoff.story_id).localeCompare(clean(b.handoff.story_id)));
}

function terminal(state){
  return state==='published'||state==='published_postflight_failed';
}

export async function runCfbJournalPublishCycle({
  journalRoot,
  credentialStateDir,
  inputState=emptyCfbClipResidentState(),
  publisher=publishCfbJournalToFacebook,
  authorizeStory=async()=>({decision:'deny',reason:'authorization_checker_missing'}),
  fetchImpl=globalThis.fetch,
  now=()=>new Date().toISOString(),
  maxPublishesPerCycle=1,
}={}){
  const state=normalizeState(inputState);
  const observedAt=now();
  const handoffs=discoverCfbJournalHandoffs(journalRoot);
  const events=[];
  let providerPublishes=0;

  for(const row of handoffs){
    const storyId=clean(row.handoff.story_id);
    const previous=state.stories[storyId]||null;
    if(previous&&terminal(previous.state)){
      events.push({
        story_id:storyId,
        slug:row.slug,
        action:'skip_terminal',
        state:previous.state,
        remote_id:previous.remote_id||null,
      });
      continue;
    }
    if(providerPublishes>=Math.max(1,Number(maxPublishesPerCycle)||1)){
      events.push({story_id:storyId,slug:row.slug,action:'hold_cycle_limit',state:'pending'});
      continue;
    }

    const resourceRef=journalStoryResourceRef(row.slug);
    let authorization;
    try{
      authorization=await authorizeStory({
        story_id:storyId,
        slug:row.slug,
        resource_ref:resourceRef,
        scope:'home.clip.publish',
      });
    }catch(error){
      authorization={decision:'deny',reason:error instanceof Error?error.message:String(error)};
    }
    if(authorization?.decision!=='allow'){
      const reason=clean(authorization?.reason)||'home_clip_publish_not_authorized';
      state.stories[storyId]={
        state:'authorization_hold',
        slug:row.slug,
        canonical_url:clean(row.handoff.canonical_url),
        resource_ref:resourceRef,
        last_error:reason,
        last_attempt_at:observedAt,
        attempt_count:Number(previous?.attempt_count||0)+1,
        provider_published:false,
      };
      events.push({
        story_id:storyId,
        slug:row.slug,
        action:'authorization_hold',
        state:'authorization_hold',
        resource_ref:resourceRef,
        error:reason,
      });
      continue;
    }

    let receipt;
    try{
      receipt=await publisher({
        handoff:row.handoff,
        authorizationRef:clean(authorization.grant_id)
          ? 'passport-grant:'+clean(authorization.grant_id)
          : clean(authorization.authorization_ref)||'passport:home.clip.publish',
        fetchImpl,
        resolveCredential:()=>resolveFacebookPageCredential({credentialStateDir}),
      });
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      state.stories[storyId]={
        state:'retryable_failed',
        slug:row.slug,
        canonical_url:clean(row.handoff.canonical_url),
        last_error:message,
        last_attempt_at:observedAt,
        attempt_count:Number(previous?.attempt_count||0)+1,
      };
      events.push({story_id:storyId,slug:row.slug,action:'attempt_failed',state:'retryable_failed',error:message});
      continue;
    }

    const receiptState=clean(receipt?.status)||'failed';
    const providerPublished=receiptState==='published'||receiptState==='published_postflight_failed';
    if(providerPublished) providerPublishes+=1;

    state.stories[storyId]={
      state:receiptState,
      slug:row.slug,
      canonical_url:clean(row.handoff.canonical_url),
      remote_id:clean(receipt?.remoteId)||null,
      post_url:clean(receipt?.url)||null,
      last_error:clean(receipt?.error||receipt?.postflight_error)||null,
      last_attempt_at:observedAt,
      published_at:providerPublished?clean(receipt?.publishedAt)||observedAt:null,
      attempt_count:Number(previous?.attempt_count||0)+1,
      provider_published:providerPublished,
      canonical_preflight_verified:receipt?.publicLinkPreflight?.verified===true,
      canonical_postflight_verified:receipt?.boundaries?.canonicalPostflightVerified===true,
    };
    events.push({
      story_id:storyId,
      slug:row.slug,
      action:providerPublished?'provider_published':'attempt_failed',
      state:receiptState,
      remote_id:clean(receipt?.remoteId)||null,
    });
  }

  state.cycle_count+=1;
  state.observed_at=observedAt;

  const values=Object.values(state.stories);
  return {
    schema:'evercraft.clip.cfb-journal-resident-cycle.v1',
    state,
    snapshot:{
      observed_at:observedAt,
      cycle_count:state.cycle_count,
      discovered_handoffs:handoffs.length,
      tracked_stories:values.length,
      published:values.filter(row=>row.state==='published').length,
      published_postflight_failed:values.filter(row=>row.state==='published_postflight_failed').length,
      retryable_failed:values.filter(row=>row.state==='retryable_failed'||row.state==='failed').length,
      authorization_holds:values.filter(row=>row.state==='authorization_hold').length,
      provider_publishes_this_cycle:providerPublishes,
      events,
      boundaries:{
        cfbJournalOnly:true,
        maxProviderPublishesPerCycle:Math.max(1,Number(maxPublishesPerCycle)||1),
        terminalProviderReceiptsNeverRepublished:true,
        passportAuthorizationRequired:true,
        storyResourceAuthorizationRequired:true,
        credentialsResolvedOnlyAfterAuthorization:true,
        credentialsResolvedOnlyInsideResident:true,
        arbitraryUrlsAccepted:false,
      },
    },
  };
}
