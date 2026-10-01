import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function shaFile(filePath){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(path.resolve(filePath),'utf8'));
}

function unique(values){
  return [...new Set((values||[]).filter(Boolean))];
}

function validateRequest(request){
  if(request?.schema!=='evercraft.clip.publish-request.v1') throw new Error('clip_publish_schema_invalid');
  if(!request.id?.trim()) throw new Error('clip_publish_id_missing');
  if(!request.intakeReceiptPath?.trim()) throw new Error('clip_publish_intake_receipt_missing');
  if(!request.destination?.trim()) throw new Error('clip_publish_destination_missing');
  if(!request.brandKey?.trim()) throw new Error('clip_publish_brand_key_missing');
  if(request.authorization?.approved!==true) throw new Error('clip_publish_authorization_missing');
  if(!request.authorization?.authorizationRef?.trim()) throw new Error('clip_publish_authorization_ref_missing');
}

function loadVerifiedIntake(request){
  const receiptPath=path.resolve(request.intakeReceiptPath);
  if(!fs.existsSync(receiptPath)) throw new Error('clip_publish_intake_receipt_file_missing');
  const receipt=readJson(receiptPath);
  if(receipt.schema!=='evercraft.clip.intake-receipt.v1') throw new Error('clip_publish_intake_receipt_schema_invalid');
  if(receipt.status!=='staged') throw new Error('clip_publish_intake_not_staged');
  if(receipt.boundaries?.firstPartyQueue!==true) throw new Error('clip_publish_first_party_queue_not_proven');
  if(receipt.boundaries?.inputBytesReverified!==true) throw new Error('clip_publish_input_bytes_not_reverified');
  if(receipt.boundaries?.masterQcRequired!==true) throw new Error('clip_publish_master_qc_not_proven');
  if(receipt.boundaries?.publicationAuthorityGranted!==false) throw new Error('clip_publish_upstream_publication_boundary_invalid');

  const manifestPath=path.resolve(receipt.stagedManifestPath||'');
  if(!fs.existsSync(manifestPath)) throw new Error('clip_publish_staged_manifest_missing');
  const manifest=readJson(manifestPath);
  if(manifest.schema!=='evercraft.clip.media-intake.v1') throw new Error('clip_publish_manifest_schema_invalid');
  if(manifest.deliveryId!==receipt.deliveryId) throw new Error('clip_publish_delivery_id_mismatch');
  if(!manifest.destinations?.includes(request.destination)) throw new Error('clip_publish_destination_not_admitted');
  if(manifest.contentClass==='social_spectacle'){
    if(manifest.editorialGate?.status!=='accepted'||Number(manifest.editorialGate?.score)!==10||Number(manifest.editorialGate?.maximum_score)!==10){
      throw new Error('clip_publish_social_spectacle_editorial_gate_invalid');
    }
    if(manifest.productionGrade?.status!=='accepted'||manifest.productionGrade?.text_primary!==false||manifest.productionGrade?.source_grounded!==true){
      throw new Error('clip_publish_social_spectacle_production_grade_invalid');
    }
  }
  if(!fs.existsSync(receipt.stagedMediaPath)) throw new Error('clip_publish_staged_media_missing');

  const observed=shaFile(receipt.stagedMediaPath);
  if(observed!==receipt.mediaSha256) throw new Error('clip_publish_staged_media_receipt_digest_mismatch');
  if(observed!==manifest.media?.sha256) throw new Error('clip_publish_staged_media_manifest_digest_mismatch');

  return {receipt,manifest,manifestPath,mediaPath:path.resolve(receipt.stagedMediaPath),mediaSha256:observed};
}

export async function publishClipMedia({request,adapters,policy}){
  validateRequest(request);
  if(policy?.allowPublishing!==true) throw new Error('clip_publish_policy_disabled');
  const allowedDestinations=new Set(policy.allowedDestinations||[]);
  if(!allowedDestinations.has(request.destination)) throw new Error('clip_publish_policy_destination_blocked');
  const blockedBrands=new Set((policy.blockedBrandKeys||[]).map(value=>String(value).toLowerCase()));
  if(blockedBrands.has(request.brandKey.toLowerCase())) throw new Error('clip_publish_policy_brand_blocked');

  const intake=loadVerifiedIntake(request);
  const adapter=(adapters||[]).find(item=>item.destination===request.destination&&item.verified===true);
  if(!adapter) throw new Error('clip_publish_verified_adapter_missing');

  const metadata={
    title:String(request.metadata?.title||intake.manifest.metadata?.title||'').trim(),
    description:String(request.metadata?.description??intake.manifest.metadata?.description??'').trim(),
    tags:unique(request.metadata?.tags??intake.manifest.metadata?.tags??[]),
    privacyStatus:request.metadata?.privacyStatus,
  };
  if(!metadata.title) throw new Error('clip_publish_title_missing');

  const startedAt=new Date().toISOString();
  try{
    const result=await adapter.publish({
      requestId:request.id,
      mediaPath:intake.mediaPath,
      mediaSha256:intake.mediaSha256,
      metadata,
      brandKey:request.brandKey,
      authorizationRef:request.authorization.authorizationRef,
    });
    if(result?.state!=='published') throw new Error('clip_publish_adapter_not_published');
    if(!result.remoteId) throw new Error('clip_publish_remote_id_missing');
    if(!result.url) throw new Error('clip_publish_remote_url_missing');
    if(result.mediaSha256!==intake.mediaSha256) throw new Error('clip_publish_provider_media_digest_mismatch');
    if(!Array.isArray(result.sourceRefs)||result.sourceRefs.length===0) throw new Error('clip_publish_provider_source_refs_missing');

    return {
      schema:'evercraft.clip.publish-receipt.v1',
      status:'published',
      requestId:request.id,
      deliveryId:intake.receipt.deliveryId,
      destination:request.destination,
      brandKey:request.brandKey,
      mediaSha256:intake.mediaSha256,
      remoteId:result.remoteId,
      url:result.url,
      providerRequestId:result.providerRequestId||result.remoteId,
      requestedPrivacyStatus:metadata.privacyStatus||null,
      observedPrivacyStatus:result.observedPrivacyStatus||null,
      authorizationRef:request.authorization.authorizationRef,
      sourceRefs:[
        'clip-intake:'+intake.receipt.manifestDigest,
        ...result.sourceRefs,
      ],
      boundaries:{
        firstPartyClipRuntime:true,
        verifiedAdapterRequired:true,
        inputDigestBound:true,
        explicitAuthorizationRequired:true,
        providerReceiptRequired:true,
        publicationStateAssertedFromProviderResponse:true,
      },
      startedAt,
      publishedAt:new Date().toISOString(),
    };
  }catch(error){
    return {
      schema:'evercraft.clip.publish-receipt.v1',
      status:'failed',
      requestId:request.id,
      deliveryId:intake.receipt.deliveryId,
      destination:request.destination,
      brandKey:request.brandKey,
      mediaSha256:intake.mediaSha256,
      authorizationRef:request.authorization.authorizationRef,
      error:error instanceof Error?error.message:String(error),
      boundaries:{
        firstPartyClipRuntime:true,
        verifiedAdapterRequired:true,
        inputDigestBound:true,
        explicitAuthorizationRequired:true,
        providerReceiptRequired:true,
        publicationStateAssertedFromProviderResponse:false,
      },
      startedAt,
      failedAt:new Date().toISOString(),
    };
  }
}
