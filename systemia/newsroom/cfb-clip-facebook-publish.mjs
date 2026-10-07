#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildJournalClipSocialPublishRequest } from './journal-clip-bridge.mjs';
import { publishClipSocialPost } from '../clip/social-publisher-runtime.mjs';
import { createFacebookPagePublisherAdapter } from '../clip/facebook-page-publisher.mjs';
import { resolveFacebookPageCredential } from '../clip/facebook-page-credential-resolver.mjs';
import { preflightPublicLink } from '../clip/public-link-preflight.mjs';

function clean(value){ return String(value??'').trim(); }

function facebookCopy(handoff){
  const derivative=(handoff?.derivatives||[]).find(row=>clean(row?.platform).toLowerCase()==='facebook');
  const copy=clean(derivative?.copy);
  if(!copy) throw new Error('cfb_clip_facebook_derivative_missing');
  return copy;
}

export async function publishCfbJournalToFacebook({
  handoff,
  authorizationRef='policy:evercraft-journal-autopublish-v1',
  brandKey='evercraft-journal',
  fetchImpl=globalThis.fetch,
  resolveCredential=()=>resolveFacebookPageCredential(),
  adapterFactory=createFacebookPagePublisherAdapter,
  allowPublish=true,
}={}){
  if(handoff?.schema!=='evercraft.clip.journal-handoff.v1') throw new Error('cfb_clip_handoff_schema_invalid');
  if(!clean(handoff.story_id).includes('cfb-power-rankings')) throw new Error('cfb_clip_story_scope_invalid');
  if(handoff.publication_authority!==false) throw new Error('cfb_clip_handoff_boundary_invalid');

  const request=buildJournalClipSocialPublishRequest({
    handoff,
    destination:'facebook-page',
    brandKey,
    authorizationRef,
    message:facebookCopy(handoff),
    campaign:'evercraft-cfb-power-rankings',
    requestId:'cfb-facebook:'+clean(handoff.story_id),
  });

  const credential=resolveCredential();
  if(credential?.safe_status?.facebook!=='resolved'){
    throw new Error('cfb_clip_facebook_credential_unavailable:'+clean(credential?.safe_status?.facebook||'unknown'));
  }

  const adapter=adapterFactory({
    ...credential.config,
    fetchImpl,
    verified:true,
    allowPublish:allowPublish===true,
  });

  const receipt=await publishClipSocialPost({
    request,
    adapters:[adapter],
    policy:{
      allowPublishing:allowPublish===true,
      allowedDestinations:['facebook-page'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
      publicLinkPreflight:{fetchImpl},
    },
  });

  if(receipt.status!=='published') return receipt;

  let canonicalPostflight=null;
  try{
    canonicalPostflight=await preflightPublicLink({
      url:request.metadata.link,
      fetchImpl,
      expectedText:request.linkVerification.expectedText,
      expectedCanonicalUrl:request.linkVerification.expectedCanonicalUrl,
      expectedOgUrl:request.linkVerification.expectedOgUrl,
      expectedStoryId:request.linkVerification.expectedStoryId,
      requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true,
    });
  }catch(error){
    return {
      ...receipt,
      status:'published_postflight_failed',
      canonicalPostflight:null,
      postflight_error:error instanceof Error?error.message:String(error),
      boundaries:{
        ...receipt.boundaries,
        canonicalPostflightVerified:false,
      },
    };
  }

  return {
    ...receipt,
    canonicalPostflight,
    boundaries:{
      ...receipt.boundaries,
      canonicalPostflightVerified:canonicalPostflight.verified===true,
      journalReceiptBound:true,
    },
  };
}

async function main(){
  const handoffPath=process.argv[2];
  const receiptPath=process.argv[3]||'_cfb_power_run/facebook-publish-receipt.json';
  if(!handoffPath) throw new Error('Usage: cfb-clip-facebook-publish.mjs <clip-handoff.json> [receipt.json]');
  const handoff=JSON.parse(fs.readFileSync(path.resolve(handoffPath),'utf8'));
  const receipt=await publishCfbJournalToFacebook({handoff});
  fs.mkdirSync(path.dirname(path.resolve(receiptPath)),{recursive:true});
  fs.writeFileSync(path.resolve(receiptPath),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
  if(receipt.status!=='published') process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
