import crypto from 'node:crypto';
import {INFLUENCE_SCHEMA} from './influence-lab.mjs';
import {normalizeCommercialCampaign,compileCommercialAttention,assessCommercialScrollStop} from '../graphics-command/commercial-director.mjs';

const METHODS=Object.freeze({
  designer:{
    hook:'DESIGNED TO BE UNDERSTOOD',
    subhook:'Your best work deserves a clear path.',
    cta:'EXPLORE THE AUDIT',
    visualMetaphor:'A real hand holds a phone while a transparent physical path reveals where a visitor might hesitate. This is explicitly conceptual, not a discovered client defect.',
    sonicHook:['Curiosity','Frustration','Clarity','Invitation'],
    shots:[
      {id:'arrival',beat:'identity',durationSec:5.5,intent:'Editorial macro photography of a physical phone and truthful visible website content. Glass is metaphorical, not a fabricated product UI.',screenText:'A website can look finished.'},
      {id:'friction',beat:'question',durationSec:5.4,intent:'Concept-only refractive visual obscures one visitor journey. Include concept label, no implied diagnosed fault.',screenText:"That doesn't mean every path feels easy."},
      {id:'clarity',beat:'evidence',durationSec:5.5,intent:'Switch to a real permissioned capture of a bounded audit workflow, or stop production until that capture is available.',screenText:'Look from the visitor side.'},
      {id:'invitation',beat:'cta',durationSec:5.4,intent:'Finish with a verified current offer and one readable, accessible CTA; no simulated purchase success.',screenText:'Understand the friction.'},
    ],
    requiredSourceMedia:['permissioned_phone_footage','licensed_concept_media','verified_actual_product_capture'],
  },
  human:{
    hook:'SHOW YOUR WORK',
    subhook:'A real person. A real demonstration.',
    cta:'SEE HOW IT WORKS',
    visualMetaphor:'Unscripted operator and uninterrupted permissioned screen capture. Documentary cuts show process without fake customer endorsements.',
    sonicHook:['Room tone','One observation','A specific finding','Clear next step'],
    shots:[
      {id:'introduce',beat:'human',durationSec:6,intent:'Consent-cleared real operator introduces what their public website review can and cannot show.',screenText:'What I check first.'},
      {id:'observe',beat:'firsthand',durationSec:9,intent:'Show real capture and one verifiable public-page observation with evidence and no imagined outcome.',screenText:'Here is what I noticed.'},
      {id:'explain',beat:'scope',durationSec:7,intent:'Explain evidence, limits and actual deliverable in ordinary language. No synthetic customer reaction.',screenText:'Here is what it means.'},
      {id:'next',beat:'cta',durationSec:7,intent:'Show exact current public offer, real destination and one next action. Disclose employee or material relationship.',screenText:'See the process yourself.'},
    ],
    requiredSourceMedia:['opted_in_real_operator','permissioned_real_capture','relationship_disclosure'],
  },
  proof:{
    hook:'WHAT CAN VISITORS ACTUALLY DO?',
    subhook:'Check the path. Show the evidence.',
    cta:'REVIEW THE PROCESS',
    visualMetaphor:'Source-labeled real workflow showing a bounded public website audit input, evidence, limitations and deliverable. No fictional screenshot or fabricated metric.',
    sonicHook:['Question','Capture','Evidence','Handoff'],
    shots:[
      {id:'problem',beat:'question',durationSec:5,intent:'Introduce an explicitly illustrative buyer question without implying this particular site loses money.',screenText:'Where do visitors hesitate?'},
      {id:'demo',beat:'actual_capture',durationSec:8,intent:'Uncut authorized real workflow input and genuine returned data; production must stop if footage is unavailable.',screenText:'See the actual review.'},
      {id:'limits',beat:'boundaries',durationSec:6,intent:'Display a meaningful factual limitation of public-page evidence; no fake numerical conversion claims.',screenText:'Know what it cannot prove.'},
      {id:'offer',beat:'cta',durationSec:6,intent:'Show verified offer scope and destination. No assertion of completed payment or fulfillment.',screenText:'Get a scoped next step.'},
    ],
    requiredSourceMedia:['actual_audit_screen_capture','public_evidence_sources','verified_offer_destination'],
  },
});

const compact=s=>String(s??'').trim();
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const suitable=ref=>Array.isArray(ref)&&ref.length>0&&ref.every(x=>typeof x==='string'&&x.trim().length>0);

/**
 * Prepare native Graphics Command campaign/plan structures for creative review.
 * Never sends work to an agent, renders art, verifies checkout or publishes.
 * Existing Graphics Command renderer is conversion-leak-specific: it MUST NOT
 * be presented as a distinct designer/human/proof renderer.
 */
export function planInfluenceGraphics({brief,referenceCampaign}={}){
  if(brief?.schema!==INFLUENCE_SCHEMA||!brief.digest||brief.releaseState!=='review_only'){
    throw new Error('influence_graphics_brief_not_review_only');
  }
  const src=normalizeCommercialCampaign(referenceCampaign);
  if(src.offerUrl!==brief.offerUrl)throw new Error('influence_graphics_offer_url_mismatch');
  if(!suitable(brief.evidenceRefs)||!suitable(src.sourceRefs))throw new Error('influence_graphics_sources_missing');
  if(!brief.treatments||brief.treatments.length!==3)throw new Error('influence_graphics_treatments_missing');
  const refKeys=brief.treatments.map(x=>x.key);
  if(refKeys.join(',')!=='designer,human,proof')throw new Error('influence_graphics_treatments_unexpected');
  const outputs=brief.treatments.map(treatment=>{
    const direction=METHODS[treatment.key];
    if(!direction)throw new Error('influence_graphics_treatment_unknown');
    const campaign=normalizeCommercialCampaign({
      schema:'evercraft.commercial-attention-campaign.v1',
      id:treatment.campaignId,
      slug:treatment.campaignId.toLowerCase().replaceAll('_','-').replaceAll('.','-'),
      product:src.product,offer:src.offer,offerUrl:src.offerUrl,priceUsd:src.priceUsd,
      audience:brief.targetCommunity,
      truthState:'concept_requires_actual_evidence',
      sourceRefs:[...new Set([...brief.evidenceRefs,...src.sourceRefs])],
      creative:{
        eyebrow:'EVERCRAFT • '+treatment.key.toUpperCase()+' STUDY',
        hook:direction.hook,subhook:direction.subhook,cta:direction.cta,
        priceLockup:'$'+src.priceUsd,
        visualMetaphor:direction.visualMetaphor,
        palette:src.creative.palette,
        sonicHook:direction.sonicHook,
        guardrails:[
          'THIS IS A CONCEPT ONLY. No customer-specific defect or result may be invented.',
          'Do not publish a visual or a price until live checkout and fulfillment are independently verified.',
          'Render only with real licensed media or unmistakably labeled synthetic illustration.',
          'Do not imply creator or customer consent without source evidence.',
        ],
      },
      deliverables:src.deliverables,
      shots:direction.shots,
      boundaries:{publicationAuthority:false,paymentAuthority:'Evercraft Payments',
        syntheticVisualMustNotMasqueradeAsObservedCustomerEvidence:true,
        cannotRunLegacyCommercialRendererAsDifferentiatedTreatment:true},
    });
    const plan=compileCommercialAttention(campaign);
    const scrollStop=assessCommercialScrollStop(plan);
    if(scrollStop.status!=='pass')throw new Error('influence_graphics_plan_failed_qc:'+treatment.key);
    return {key:treatment.key,creativeDirection:treatment.creativeDirection,
      requiredSourceMedia:direction.requiredSourceMedia,
      campaign,plan,scrollStop,
      visualsRendered:false,realMediaVerified:false,
      existingRendererCompatible:false,
      state:'requires_distinct_renderer_and_real_media',
      publicationAuthority:false,
    };
  });
  const output={schema:'evercraft.influence-lab.graphics-review-slate.v1',
    campaignId:brief.campaignId,briefDigest:brief.digest,
    outputState:'review_only',treatments:outputs,
    rendererBlocker:'legacy_commercial_renderer_is_conversion_leak_only',
    sourceMediaBlocker:'no_permissioned_or_actual_video_media_attached',
    systemiaAdmitted:false,boardroomExecuted:false,publicationAuthority:false,
    noPaidOutcomeClaim:true};
  return {...output,digest:hash({campaignId:output.campaignId,
    briefDigest:output.briefDigest,
    campaignDigests:outputs.map(x=>x.campaign.digest),
    planDigests:outputs.map(x=>x.plan.digest)})};
}
