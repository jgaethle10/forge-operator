import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {renderSpaceDudzSocialPng} from '../graphics-command/space-dudz-social-raster.mjs';
import {createFacebookPagePhotoPublisherAdapter} from './facebook-page-photo-publisher.mjs';
import {resolveFacebookPageCredential} from './facebook-page-credential-resolver.mjs';

function clean(value){return String(value??'').trim();}
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}

export function loadSpaceDudzCampaign(repoRoot,campaignPath='systemia/clip/campaigns/space-dudz-orbit-one/campaign.json'){
  const root=path.resolve(repoRoot);
  const file=path.resolve(root,campaignPath);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)) throw new Error('space_dudz_campaign_file_invalid');
  const campaign=JSON.parse(fs.readFileSync(file,'utf8'));
  if(campaign?.schema!=='evercraft.clip.space-dudz-campaign.v1') throw new Error('space_dudz_campaign_schema_invalid');
  if(clean(campaign.brand_key)!=='space-dudz') throw new Error('space_dudz_brand_scope_invalid');
  if(clean(campaign.resource_ref)!=='brand:space-dudz') throw new Error('space_dudz_resource_scope_invalid');
  if(clean(campaign.creative_system)!=='evercraft_graphics_command') throw new Error('space_dudz_creative_system_invalid');
  if(campaign.publication_authority!==false) throw new Error('space_dudz_campaign_boundary_invalid');
  if(!Array.isArray(campaign.candidates)||campaign.candidates.length<2) throw new Error('space_dudz_candidates_missing');
  return {file,campaign};
}

export function renderSpaceDudzCandidateAsset(campaign,candidate){
  const bytes=renderSpaceDudzSocialPng({campaign,candidate});
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1024) throw new Error('space_dudz_candidate_asset_invalid:'+clean(candidate?.id));
  const signature=Buffer.from(bytes).subarray(0,8).toString('hex');
  if(signature!=='89504e470d0a1a0a') throw new Error('space_dudz_candidate_png_signature_invalid:'+clean(candidate?.id));
  return {bytes:Buffer.from(bytes),sha256:digest(bytes),sourceRef:'graphics-command:space-dudz-social-raster-v1'};
}

export async function publishSpaceDudzCandidateFacebook({
  repoRoot,
  campaign,
  candidate,
  credentialStateDir,
  authorizationRef,
  fetchImpl=globalThis.fetch,
  resolveCredential=()=>resolveFacebookPageCredential({credentialStateDir}),
  adapterFactory=createFacebookPagePhotoPublisherAdapter,
}={}){
  if(!repoRoot) throw new Error('space_dudz_repo_root_required');
  if(campaign?.schema!=='evercraft.clip.space-dudz-campaign.v1') throw new Error('space_dudz_campaign_schema_invalid');
  if(clean(campaign.brand_key)!=='space-dudz'||clean(campaign.resource_ref)!=='brand:space-dudz') throw new Error('space_dudz_campaign_scope_invalid');
  if(!clean(authorizationRef)) throw new Error('space_dudz_publish_authorization_ref_missing');
  if(clean(campaign.brand_key).toLowerCase()==='rnb-chicken-and-soul') throw new Error('space_dudz_publish_brand_blocked');
  const found=(campaign.candidates||[]).find(row=>clean(row.id)===clean(candidate?.id));
  if(!found) throw new Error('space_dudz_candidate_not_in_campaign');

  const asset=renderSpaceDudzCandidateAsset(campaign,found);
  const credential=resolveCredential();
  if(credential?.safe_status?.facebook!=='resolved'){
    throw new Error('space_dudz_facebook_credential_unavailable:'+clean(credential?.safe_status?.facebook||'unknown'));
  }
  const adapter=adapterFactory({...credential.config,fetchImpl,verified:true,allowPublish:true});
  if(adapter?.verified!==true||adapter?.destination!=='facebook-page-photo') throw new Error('space_dudz_verified_photo_adapter_missing');

  const startedAt=new Date().toISOString();
  try{
    const result=await adapter.publish({
      imageBytes:asset.bytes,
      mimeType:'image/png',
      caption:clean(found.caption),
      contentDigest:'sha256:'+asset.sha256,
    });
    if(result?.state!=='published'||!clean(result.remoteId)||!clean(result.url)) throw new Error('space_dudz_provider_receipt_invalid');
    return {
      schema:'evercraft.clip.space-dudz-facebook-receipt.v1',
      status:'published',
      campaignId:clean(campaign.campaign_id),
      pollId:clean(campaign.poll_id),
      candidateId:clean(found.id),
      candidateLabel:clean(found.label),
      candidateName:clean(found.name),
      destination:'facebook-page',
      brandKey:'space-dudz',
      mediaSha256:asset.sha256,
      remoteId:clean(result.remoteId),
      url:clean(result.url),
      authorizationRef:clean(authorizationRef),
      sourceRefs:[asset.sourceRef,...(result.sourceRefs||[])],
      boundaries:{
        evercraftClip:true,
        graphicsCommandAsset:true,
        publicImageHostRequired:false,
        spaceDudzOnly:true,
        rnbChickenAndSoulExcluded:true,
        providerReceiptRequired:true,
        publicationStateAssertedFromProviderResponse:true,
        assetDigestBound:true,
        credentialsResolvedInsideOwnedRuntime:true,
      },
      startedAt,
      publishedAt:new Date().toISOString(),
    };
  }catch(error){
    return {
      schema:'evercraft.clip.space-dudz-facebook-receipt.v1',
      status:'failed',
      campaignId:clean(campaign.campaign_id),
      candidateId:clean(found.id),
      destination:'facebook-page',
      brandKey:'space-dudz',
      mediaSha256:asset.sha256,
      authorizationRef:clean(authorizationRef),
      error:error instanceof Error?error.message:String(error),
      boundaries:{
        evercraftClip:true,
        graphicsCommandAsset:true,
        publicImageHostRequired:false,
        spaceDudzOnly:true,
        rnbChickenAndSoulExcluded:true,
        publicationStateAssertedFromProviderResponse:false,
        assetDigestBound:true,
      },
      startedAt,
      failedAt:new Date().toISOString(),
    };
  }
}
