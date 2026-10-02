import crypto from 'node:crypto';
import type {
  CinematicSequenceInput,
  CinematicShotIntent,
} from './cinematic-sequence.js';
import type {
  CharacterPerformanceBeat,
  PerformancePlanInput,
} from './performance-director.js';
import type { VisualReference } from './model-fabric.js';

export interface GoldenBridgeBenchmarkAssets {
  eliIdentity:VisualReference[];
  foxIdentity:VisualReference[];
  bridgeEnvironment:VisualReference[];
  eliDialogueAudio?:VisualReference;
  sourceRefs:string[];
}

export interface GoldenBridgeBenchmarkBundle {
  schema:'evercraft.fallen.golden-bridge-benchmark.v1';
  benchmarkId:'fallen-golden-bridge-rescue-v1';
  title:string;
  purpose:string;
  sequence:CinematicSequenceInput;
  performance:PerformancePlanInput;
  dialogue:{
    shotId:'bridge-03-dialogue';
    speakerId:'eli';
    targetId:'fox';
    text:string;
    approvedAudio?:VisualReference;
  };
  expectations:{
    candidateCount:4;
    modelDiversity:2;
    requiredIdentityEntities:['eli','fox'];
    requiredEnvironmentIds:['bridge'];
    requiredContinuityCuts:Array<{previousShotId:string;currentShotId:string}>;
    requiredDialogueShotIds:['bridge-03-dialogue'];
    requiredSequenceMetrics:[
      'edit_rhythm',
      'composition_variety',
      'camera_motivation',
      'motion_naturalism',
      'performance_naturalism',
      'visual_hierarchy',
      'tone_coherence',
      'spectacle_restraint'
    ];
    minimumMaster:{
      width:1920;
      height:1080;
      fps:23.9;
      audioRequired:true;
    };
  };
  sourceRefs:string[];
  bundleDigest:string;
  boundaries:{
    assetBytesNotEmbedded:true;
    userApprovedCanonReferencesRequired:true;
    dialogueAudioOptionalUntilExecution:true;
    sameBenchmarkMustBeReusedForRegression:true;
    paidGenerationAuthorityGranted:false;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validateRefSet(
  label:string,
  refs:VisualReference[],
  role:'identity'|'environment',
){
  if(!refs.length) throw new Error('golden_bridge_reference_missing:'+label);
  for(const ref of refs){
    if(ref.role!==role) throw new Error('golden_bridge_reference_role_invalid:'+label+':'+ref.id);
    if(ref.kind!=='image'&&ref.kind!=='video'){
      throw new Error('golden_bridge_reference_kind_invalid:'+label+':'+ref.id);
    }
    if(!ref.sourceRefs?.length){
      throw new Error('golden_bridge_reference_source_refs_missing:'+label+':'+ref.id);
    }
  }
}

function shots():CinematicShotIntent[]{
  return [
    {
      id:'bridge-01-establish',
      needId:'golden-bridge-need-01',
      locationId:'bridge',
      durationSec:8,
      prompt:[
        'Establish the storm-damaged amber bridge at night as Eli braces on the left side of frame and the fox loses footing on the right.',
        'Rain and wind are physical but readable. The bridge geometry, damage, wardrobe, mask and fox markings are canon locks.',
        'Eli commits toward the fox at the end of the shot so the next cut can continue the same grab.'
      ].join(' '),
      sourceRefs:['benchmark:golden-bridge','story:bridge-rescue'],
      characters:[
        {
          entityId:'eli',
          startZone:'left',
          endZone:'left',
          startFacing:'right',
          endFacing:'right',
          eyeline:'offscreen_right',
          action:'plants left foot, reaches across the broken rail toward the fox',
          propIds:['watcher-mask'],
        },
        {
          entityId:'fox',
          startZone:'right',
          endZone:'right',
          startFacing:'left',
          endFacing:'left',
          eyeline:'offscreen_left',
          action:'hind paws slip from the fractured bridge edge while front paws scrape for purchase',
        },
      ],
      shotScale:'wide',
      lensMm:28,
      cameraMovement:'follow',
      screenDirection:'left_to_right',
      actionContinuityId:'bridge-rescue-grab',
    },
    {
      id:'bridge-02-catch',
      needId:'golden-bridge-need-02',
      locationId:'bridge',
      durationSec:8,
      prompt:[
        'Continue the exact rescue action from the prior end frame.',
        'Close coverage: Eli catches the fox by the forelegs at the last instant.',
        'Hands, paws, rain direction, bridge damage, wardrobe and screen direction must match the prior boundary.',
        'Favor believable strain, slipping weight and micro-corrections over heroic posing.'
      ].join(' '),
      sourceRefs:['benchmark:golden-bridge','story:bridge-rescue'],
      characters:[
        {
          entityId:'eli',
          startZone:'left',
          endZone:'left',
          startFacing:'right',
          endFacing:'right',
          eyeline:'offscreen_right',
          action:'completes the reach, catches the fox and absorbs the sudden downward weight',
          propIds:['watcher-mask'],
        },
        {
          entityId:'fox',
          startZone:'right',
          endZone:'right',
          startFacing:'left',
          endFacing:'left',
          eyeline:'offscreen_left',
          action:'drops half a body length, is caught, then twists toward Eli',
        },
      ],
      shotScale:'close',
      lensMm:85,
      cameraMovement:'handheld',
      screenDirection:'left_to_right',
      actionContinuityId:'bridge-rescue-grab',
    },
    {
      id:'bridge-03-dialogue',
      needId:'golden-bridge-need-03',
      locationId:'bridge',
      durationSec:8,
      prompt:[
        'Continue from the catch without resetting body position.',
        'Eli pulls the fox against the bridge edge, makes eye contact and says the approved line while fighting for breath.',
        'The dialogue must feel physically embedded in the rescue, not like a talking portrait.',
        'Keep rain, lighting, geography and bridge damage continuous across the cut.'
      ].join(' '),
      sourceRefs:['benchmark:golden-bridge','story:bridge-rescue','dialogue:eli-stay-with-me'],
      dialogue:{speakerId:'eli',targetId:'fox'},
      characters:[
        {
          entityId:'eli',
          startZone:'left',
          endZone:'center',
          startFacing:'right',
          endFacing:'right',
          eyeline:'camera_right',
          action:'hauls the fox upward, locks an elbow on the rail and speaks through strained breathing',
          propIds:['watcher-mask'],
        },
        {
          entityId:'fox',
          startZone:'right',
          endZone:'center',
          startFacing:'left',
          endFacing:'left',
          eyeline:'camera_left',
          action:'finds footing against the bridge wall and looks directly at Eli',
        },
      ],
      shotScale:'medium_close',
      lensMm:65,
      cameraMovement:'dolly_in',
      screenDirection:'left_to_right',
      actionContinuityId:'bridge-rescue-grab',
    },
    {
      id:'bridge-04-reveal',
      needId:'golden-bridge-need-04',
      locationId:'bridge',
      durationSec:8,
      prompt:[
        'Deliberately reset geography into a clear wider reveal after the rescue beat.',
        'The Watcher mask emits a restrained amber flare and structural ribs beneath the bridge answer with a faint glow.',
        'Eli and the fox remain the same people in the same storm-damaged location.',
        'The visual turn should feel consequential and uncanny, not like a spectacle reel.'
      ].join(' '),
      sourceRefs:['benchmark:golden-bridge','story:bridge-rescue'],
      characters:[
        {
          entityId:'eli',
          startZone:'center',
          endZone:'center',
          startFacing:'camera',
          endFacing:'camera',
          eyeline:'center',
          action:'holds the fox close, notices the mask warming and looks toward the bridge ribs',
          propIds:['watcher-mask'],
        },
        {
          entityId:'fox',
          startZone:'center',
          endZone:'center',
          startFacing:'camera',
          endFacing:'camera',
          eyeline:'offscreen_left',
          action:'steadies beside Eli and reacts to the amber light',
        },
      ],
      shotScale:'extreme_wide',
      lensMm:24,
      cameraMovement:'dolly_out',
      screenDirection:'neutral',
      axisReset:true,
    },
  ];
}

function performanceBeats():CharacterPerformanceBeat[]{
  return [
    {
      shotId:'bridge-01-establish',entityId:'eli',
      objective:'reach the fox before it falls',
      obstacle:'the bridge is collapsing under both of them',
      tactic:'commit body weight forward while keeping one stable anchor point',
      start:{valence:-.65,arousal:.78,control:.58},
      end:{valence:-.72,arousal:.9,control:.46},
      continuity:'carry',gazeTarget:'fox',breath:'ragged',bodyEnergy:.9,gestureScale:.65,
      microActions:['jaw tightens','left foot searches for grip','right hand opens before the lunge']
    },
    {
      shotId:'bridge-01-establish',entityId:'fox',
      objective:'stay on the bridge',
      obstacle:'hind footing is gone',
      tactic:'scrape for purchase and orient toward Eli',
      start:{valence:-.7,arousal:.8,control:.35},
      end:{valence:-.78,arousal:.92,control:.18},
      continuity:'carry',gazeTarget:'eli',breath:'shallow',bodyEnergy:.9,gestureScale:.45,
      microActions:['claws scrape','ears flatten','head snaps toward Eli']
    },
    {
      shotId:'bridge-02-catch',entityId:'eli',
      objective:'stop the fall and absorb the fox safely',
      obstacle:'the fox momentum pulls Eli off balance',
      tactic:'lock elbow and shift weight backward after contact',
      start:{valence:-.72,arousal:.9,control:.46},
      end:{valence:-.55,arousal:.88,control:.56},
      continuity:'carry',gazeTarget:'fox',breath:'held',bodyEnergy:.95,gestureScale:.55,
      microActions:['fingers close under load','shoulder drops','heel skids then catches']
    },
    {
      shotId:'bridge-02-catch',entityId:'fox',
      objective:'transfer weight into Eli grip',
      obstacle:'body continues downward after contact',
      tactic:'twist chest toward the bridge and stop kicking',
      start:{valence:-.78,arousal:.92,control:.18},
      end:{valence:-.58,arousal:.85,control:.36},
      continuity:'carry',gazeTarget:'eli',breath:'ragged',bodyEnergy:.85,gestureScale:.4,
      microActions:['body rotates','rear paws search wall','eyes lock on Eli']
    },
    {
      shotId:'bridge-03-dialogue',entityId:'eli',
      objective:'reassure the fox while finishing the pull to safety',
      obstacle:'Eli is exhausted and still carrying most of the weight',
      tactic:'make eye contact and make the promise concise',
      start:{valence:-.55,arousal:.88,control:.56},
      end:{valence:-.3,arousal:.72,control:.7},
      continuity:'carry',gazeTarget:'fox',breath:'recovering',bodyEnergy:.75,gestureScale:.28,
      microActions:['swallows before speaking','forearm trembles','eyes soften only after footing is secure'],
      dialogueDelivery:{
        pace:'measured',volume:'soft',subtext:'fear is present, but the promise is non-negotiable',
        pauseBeforeMs:180,pauseAfterMs:300
      }
    },
    {
      shotId:'bridge-03-dialogue',entityId:'fox',
      objective:'trust Eli enough to climb',
      obstacle:'panic and unstable footing',
      tactic:'follow Eli movement instead of fighting it',
      start:{valence:-.58,arousal:.85,control:.36},
      end:{valence:-.25,arousal:.62,control:.58},
      continuity:'carry',gazeTarget:'eli',breath:'recovering',bodyEnergy:.55,gestureScale:.22,
      microActions:['front paw finds the ledge','ears lift slightly','breathing begins to slow']
    },
    {
      shotId:'bridge-04-reveal',entityId:'eli',
      objective:'understand what the mask is doing without losing control of the rescue',
      obstacle:'the impossible bridge response steals attention',
      tactic:'stabilize the fox first, then track the light',
      start:{valence:-.3,arousal:.72,control:.7},
      end:{valence:.05,arousal:.66,control:.62},
      continuity:'turn',trigger:'the Watcher mask warms against Eli chest',
      gazeTarget:'bridge-ribs',breath:'deep',bodyEnergy:.5,gestureScale:.18,
      microActions:['hand checks fox balance','eyes move to mask','chin lifts toward amber ribs']
    },
    {
      shotId:'bridge-04-reveal',entityId:'fox',
      objective:'stay beside Eli and orient to the new threat',
      obstacle:'the bridge itself appears to react',
      tactic:'hold position and listen before moving',
      start:{valence:-.25,arousal:.62,control:.58},
      end:{valence:-.05,arousal:.58,control:.62},
      continuity:'turn',trigger:'amber light spreads through the bridge ribs',
      gazeTarget:'bridge-ribs',breath:'steady',bodyEnergy:.35,gestureScale:.15,
      microActions:['weight settles','ears pivot toward the bridge','tail stills']
    },
  ];
}

export function buildGoldenBridgeBenchmark(
  assets:GoldenBridgeBenchmarkAssets,
):GoldenBridgeBenchmarkBundle{
  validateRefSet('eli',assets.eliIdentity,'identity');
  validateRefSet('fox',assets.foxIdentity,'identity');
  validateRefSet('bridge',assets.bridgeEnvironment,'environment');
  if(!assets.sourceRefs?.length) throw new Error('golden_bridge_source_refs_missing');
  if(assets.eliDialogueAudio){
    if(assets.eliDialogueAudio.kind!=='audio'||assets.eliDialogueAudio.role!=='dialogue_audio'){
      throw new Error('golden_bridge_dialogue_audio_invalid');
    }
    if(!assets.eliDialogueAudio.sourceRefs?.length){
      throw new Error('golden_bridge_dialogue_audio_source_refs_missing');
    }
  }

  const sequence:CinematicSequenceInput={
    schema:'evercraft.fallen.cinematic-sequence-input.v1',
    id:'fallen-golden-bridge-rescue-v1',
    aspectRatio:'16:9',
    continuityDigest:digest({
      benchmark:'fallen-golden-bridge-rescue-v1',
      canonRefs:[
        ...assets.eliIdentity.map(ref=>ref.digest??ref.id),
        ...assets.foxIdentity.map(ref=>ref.digest??ref.id),
        ...assets.bridgeEnvironment.map(ref=>ref.digest??ref.id),
      ]
    }),
    identityReferences:{
      eli:assets.eliIdentity,
      fox:assets.foxIdentity,
    },
    environmentReferences:{
      bridge:assets.bridgeEnvironment,
    },
    candidateCount:4,
    modelDiversity:2,
    shots:shots(),
  };

  const performance:PerformancePlanInput={
    schema:'evercraft.fallen.performance-plan-input.v1',
    sequenceId:sequence.id,
    beats:performanceBeats(),
    carryTolerance:.35,
  };

  const expectations:GoldenBridgeBenchmarkBundle['expectations']={
    candidateCount:4,
    modelDiversity:2,
    requiredIdentityEntities:['eli','fox'],
    requiredEnvironmentIds:['bridge'],
    requiredContinuityCuts:[
      {previousShotId:'bridge-01-establish',currentShotId:'bridge-02-catch'},
      {previousShotId:'bridge-02-catch',currentShotId:'bridge-03-dialogue'},
    ],
    requiredDialogueShotIds:['bridge-03-dialogue'],
    requiredSequenceMetrics:[
      'edit_rhythm',
      'composition_variety',
      'camera_motivation',
      'motion_naturalism',
      'performance_naturalism',
      'visual_hierarchy',
      'tone_coherence',
      'spectacle_restraint',
    ],
    minimumMaster:{width:1920,height:1080,fps:23.9,audioRequired:true},
  };

  const core={
    schema:'evercraft.fallen.golden-bridge-benchmark.v1' as const,
    benchmarkId:'fallen-golden-bridge-rescue-v1' as const,
    title:'Golden Bridge Rescue',
    purpose:'Stress-test Fallen narrative generation on persistent identity, environment canon, action continuity, dialogue performance, finish-pass identity survival, cinematic grammar and final-master integrity.',
    sequence,
    performance,
    dialogue:{
      shotId:'bridge-03-dialogue' as const,
      speakerId:'eli' as const,
      targetId:'fox' as const,
      text:'Stay with me. I’ve got you.',
      approvedAudio:assets.eliDialogueAudio,
    },
    expectations,
    sourceRefs:[...new Set(assets.sourceRefs)],
  };

  return {
    ...core,
    bundleDigest:digest(core),
    boundaries:{
      assetBytesNotEmbedded:true,
      userApprovedCanonReferencesRequired:true,
      dialogueAudioOptionalUntilExecution:true,
      sameBenchmarkMustBeReusedForRegression:true,
      paidGenerationAuthorityGranted:false,
      publicationAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };
}
