import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateCommercialDirection,DIRECTION_SCHEMA} from './commercial-creative-direction.mjs';
import {runAssignment} from './creative-council-saban-adapter.mjs';

const make=()=>({
  schema:DIRECTION_SCHEMA,
  id:'sample-workshop-launch',
  brand:{name:'Sample Workshop',sourceRefs:['fixture:brand-guide']},
  audience:'local homeowners who want to repair a damaged cabinet',
  goal:'Show a real cabinet repair and invite customers to book a consultation',
  offer:{text:'Cabinet restoration appointments',confirmed:true,evidenceRefs:['fixture:service-sheet']},
  cta:{text:'Request a quote',confirmed:true},
  aspectRatio:'9:16',durationSec:30,
  sourceAssets:[
    {id:'real-work',path:'/private/sample-work.mp4',digest:'1'.repeat(64),kind:'video',
      rights:'owned',sourceRefs:['fixture:real-work'],evidenceState:'observed'},
  ],
  music:{brief:'Warm, restrained original instrumental with an uplifting final resolution'},
  beats:[
    {id:'opening',role:'hook',durationSec:4,subject:'cabinet door',
      subjectVisibleAtStart:true,physicalAction:'A chipped cabinet door enters the frame and is placed on a repair bench',
      visual:{assetId:'real-work',sourceRefs:['fixture:real-work']},
      camera:'Tight moving insert following the damaged edge',
      narration:{text:'A cabinet can have a second life.',intention:'curious rather than salesy'},
      musicIntensity:0.18,
    },
    {id:'detail',role:'proof',durationSec:12,subject:'craftsperson repairing wood',
      physicalAction:'A craftsperson repairs the chipped edge and blends a wood finish into the actual door',
      visual:{assetId:'real-work',sourceRefs:['fixture:real-work']},
      proofRefs:['fixture:service-sheet'],
      narration:{text:'We restore the details you notice every day, using careful preparation, patient craftsmanship, and finishes chosen for each individual piece.',intention:'precise and grounded'},
      musicIntensity:0.35,
    },
    {id:'reveal',role:'body',durationSec:8,subject:'repaired cabinet',
      physicalAction:'Open the restored cabinet door in the same workshop under natural light',
      visual:{assetId:'real-work',sourceRefs:['fixture:real-work']},
      narration:{text:'See the difference, without replacing what already belongs.',intention:'understated confidence'},
      musicIntensity:0.55,
    },
    {id:'close',role:'cta',durationSec:6,subject:'restored cabinet with business contact',
      physicalAction:'Show the restored door from the same camera angle while the business details appear',
      visual:{assetId:'real-work',sourceRefs:['fixture:real-work']},
      narration:{text:'Give us a message to start planning your project.',intention:'friendly invitation'},
      screenText:'Request a quote',
      musicIntensity:0.45,musicTransition:'Resolution under brand title',
    },
  ],
});

test('produces a source-bound 30-second studio draft and actual Saban scene jobs',async()=>{
  const r=evaluateCommercialDirection(make());
  assert.equal(r.status,'ready_for_director_review');
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.durationSec,30);
  assert.equal(r.shotPlan.length,4);
  assert.equal(r.voiceSheet.length,4);
  assert.equal(r.musicSheet.length,4);
  assert.equal(r.studioDraftPlan.schema,'evercraft.fallen.studio-draft-plan.v1');
  assert.equal(r.studioDraftPlan.scenes[0].visual.assetId,'real-work');
  assert.equal(r.studioDraftPlan.scenes[3].screenText,'Request a quote');
  assert.equal(r.creativeJobs.length,4);
  assert.equal(r.boundaries.noMediaWasGenerated,true);
  assert.equal(r.boundaries.paidProviderGenerationAuthorized,false);
  const saban=await runAssignment({assignment:{role:'cinematography_director',
    agent_id:'test-cinematographer',item:r.creativeJobs[0]}});
  assert.equal(saban.status,'completed');
  assert.ok(saban.proposal.directives.length>0);
});

test('blocks unsupported service proof and fabricated external evidence',()=>{
  const input=make();
  input.beats[1].proofRefs=['invented:business-is-number-one'];
  const r=evaluateCommercialDirection(input);
  assert.equal(r.status,'blocked');
  assert.ok(r.blockers.includes('proof_source_missing:detail'));
  assert.equal(r.studioDraftPlan,null);
});

test('blocks rushed narration rather than automatically stretching robotic speech',()=>{
  const input=make();
  input.beats[0].narration.text='A very long and painfully overloaded opening speech with far too many words for anyone to read naturally at a conversational pace in four seconds without sounding extremely mechanical.';
  const r=evaluateCommercialDirection(input);
  assert.ok(r.blockers.includes('narration_must_be_rewritten_for_timing:opening'));
  assert.equal(r.studioDraftPlan,null);
});

test('blocks broken runtime and missing CTAs before expensive generation',()=>{
  const input=make();
  input.beats[3].durationSec=5;
  input.beats[3].screenText='Call me';
  const r=evaluateCommercialDirection(input);
  assert.ok(r.blockers.includes('commercial_duration_mismatch'));
  assert.ok(r.blockers.includes('cta_copy_mismatch'));
});

test('supports missing asset coverage only as an explicitly unresolved production need',()=>{
  const input=make();
  input.beats[2].visual={prompt:'The repaired door opens in exactly the same room',sourceRefs:['fixture:approved-brief']};
  const r=evaluateCommercialDirection(input);
  assert.equal(r.status,'ready_for_director_review');
  assert.ok(r.warnings.includes('new_visual_requires_generation_or_acquisition:reveal'));
  assert.equal(r.studioDraftPlan.scenes[2].visual.assetId,undefined);
  assert.match(r.studioDraftPlan.scenes[2].visual.prompt,/same room/);
  assert.equal(r.boundaries.paidProviderGenerationAuthorized,false);
});

test('warns about stale TTS marketing scripts without inventing a replacement',()=>{
  const input=make();
  input.beats[0].narration.text='Ever had an idea to fix your home?';
  const r=evaluateCommercialDirection(input);
  assert.ok(r.warnings.includes('unoriginal_opening_copy:opening'));
  assert.equal(r.studioDraftPlan.scenes[0].narration.text,'Ever had an idea to fix your home?');
});

test('source rights and identity evidence never silently become verified',()=>{
  const input=make();
  input.sourceAssets[0].rights='unknown';
  input.brand.sourceRefs=[];
  const r=evaluateCommercialDirection(input);
  assert.ok(r.blockers.includes('asset_rights_unverified:real-work'));
  assert.ok(r.blockers.includes('brand_lineage_missing'));
});

test('evidence differences change continuity fingerprint deterministically',()=>{
  const one=make(),two=make();
  const a=evaluateCommercialDirection(one),b=evaluateCommercialDirection(one);
  assert.equal(a.continuityDigest,b.continuityDigest);
  two.brand.sourceRefs=['fixture:revised-brand-guide'];
  assert.notEqual(evaluateCommercialDirection(two).continuityDigest,a.continuityDigest);
});

test('unconfirmed quote or factual offer blocks production even with a complete cut sheet',()=>{
  const input=make();
  input.offer.confirmed=false;
  input.cta.confirmed=false;
  const r=evaluateCommercialDirection(input);
  assert.ok(r.blockers.includes('confirmed_offer_missing'));
  assert.ok(r.blockers.includes('cta_unconfirmed'));
});

test('no text-only hero footage or missing subject coverage escapes story gate',()=>{
  const input=make();
  input.beats[0].textOnly=true;
  input.beats[0].subject='';
  const r=evaluateCommercialDirection(input);
  assert.ok(r.blockers.includes('no_text_only_scene:opening'));
  assert.ok(r.blockers.includes('visual_subject_not_confirmed:opening'));
});
