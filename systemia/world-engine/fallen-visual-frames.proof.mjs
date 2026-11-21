/**
 * Deterministic, synthetic-only RC13 scene payload for native browser WebGPU QA.
 * No external source/network; no publication, sports-tracking or emergency authority.
 * Usage: node --import tsx fallen-visual-frames.proof.mjs > /tmp/rc13-plans.json
 */
import {importFallenVisualCase} from './fallen-visual-case.mjs';
import {sceneFromFallenVisualHandoff} from './fallen-visual-scene.mjs';
import {buildFallenVisualMotionLedger,verifyFallenVisualMotionLedger} from './fallen-visual-motion.mjs';
import {EvercraftWorldRuntime} from './engine.ts';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan} from './webgpu.ts';

const source={reference:'evercraft:synthetic:rc13:gpu-qa',timestamp:'',evidence:'synthetic'};
const cases=[
  {
    schema:'fallen.visual-case.v1',sector:'response',title:'FICTIONAL emergency exercise',
    source,assets:[
      {id:'H1',name:'Fictional care facility',kind:'care',priority:'high',x:200,y:200,source:'synthetic'},
      {id:'B1',name:'Fictional bridge',kind:'bridge',priority:'medium',x:540,y:340,source:'synthetic'},
      {id:'P1',name:'Fictional utility',kind:'power',priority:'low',x:690,y:270,source:'synthetic'}
    ]
  },
  {
    schema:'fallen.visual-case.v1',sector:'sports',title:'FICTIONAL original football play',
    source,players:[
      {id:'X',side:'offense',color:'#e1bd70',route:[[140,188],[340,188],[520,250],[760,250]]},
      {id:'QB',side:'offense',color:'#dedede',route:[[300,315],[365,330]]}
    ],
    defense:[{id:'CB1',x:525,y:180},{id:'S1',x:680,y:235}]
  }
];
const frames=[];
for(const specimen of cases){
  const handoff=importFallenVisualCase(specimen);
  const projection=sceneFromFallenVisualHandoff(handoff);
  const ledger=buildFallenVisualMotionLedger(handoff,projection,{ticks:60});
  if(!verifyFallenVisualMotionLedger(ledger,projection))throw Error('rc13_motion_ledger_invalid');
  const runtime=new EvercraftWorldRuntime(projection.world);
  for(const targetTick of [0,60]){
    if(targetTick>0)runtime.run(targetTick-runtime.tick,ledger.events);
    const snapshot=runtime.snapshot();
    const visual=compileVisualFrame(snapshot.worldId,snapshot.tick,snapshot.timeSec,
      projection.world.visualScene,snapshot.entities,snapshot.cameraRuntime,snapshot.activeEntityIds);
    if(!verifyVisualFrameContract(visual))throw Error('rc13_visual_frame_invalid');
    const plan=compileWebGpuRenderPlan(visual,projection.geometryAssets,{width:320,height:200});
    if(!verifyWebGpuRenderPlan(plan))throw Error('rc13_render_plan_invalid');
    if(!plan.draws.length||!plan.draws.every(d=>d.geometryId===projection.geometryAssets[0].id))throw Error('rc13_render_plan_draws_missing');
    frames.push({
      sector:specimen.sector,tick:targetTick,
      handoffDigest:handoff.digest,sceneReceiptDigest:projection.receipt.digest,
      ledgerDigest:ledger.digest,worldSnapshotDigest:snapshot.digest,
      plan,geometries:projection.geometryAssets,
      rightsState:projection.world.metadata.source_rights_state,
      sourceClass:ledger.sourceMotionClass,
      publicationAuthority:projection.world.metadata.publication_authority,
      decisionAuthority:projection.world.metadata.decision_authority
    });
  }
}
process.stdout.write(JSON.stringify({
  schema:'evercraft.rc13.gpu-frame-qa-input.v1',
  source:'synthetic_original_exercise_only',
  frames
})+'\n');
