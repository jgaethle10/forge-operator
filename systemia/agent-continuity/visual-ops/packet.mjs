// Derived visual read-model. No scanner, intervention, or provider connector is claimed.
import { createHash } from 'node:crypto';
import { reconcileIncident } from '../reconcile.mjs';

const allowed = new Set(['UNKNOWN','CONFLICT','UNVERIFIED_COMMITTED_CLAIM','UNVERIFIED_FAILED_CLAIM']);
const clean = (value, length=180) => {
  if(typeof value!=='string') throw new Error('Expected string field');
  if(value.length>length || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Unsafe display field');
  return value;
};

export function buildVisualOpsPacket(fixture, assessment) {
  // Reuse the existing, stricter shared incident gate instead of remaking truth.
  const proof=reconcileIncident(fixture,assessment);
  if(!allowed.has(proof.reconstruction.blackbox_assessment) ||
      proof.live_integrated!==false || proof.verified_collateral.length!==0)
    throw new Error('Visual operations must fail closed on unsupported evidence');

  const mission=clean(proof.mission_id), incident=clean(proof.incident_id);
  const agent=clean(proof.reconstruction.who.value);
  const operation=clean(assessment.operation_id);
  const when=clean(proof.reconstruction.when.value);
  const isRetry=name=>/retry|queue|scheduled|callback|timer|cron/i.test(name);
  const downstream=proof.possible_downstream.map((item,index)=>{
    const name=clean(item.name,100);
    return {id:'impact-'+index,label:name.replaceAll('-',' '),kind:isRetry(name)?'persistence':'impact',
      state:'POSSIBLE',evidence:'SYNTHETIC',detail:'Possible dependency, not an observed event'};
  });
  if(downstream.length>30) throw new Error('Refuse oversized scene');
  const nodes=[
    {id:'agent',label:'Worker',detail:agent,kind:'agent',state:'EXITED',evidence:'SYNTHETIC'},
    {id:'operation',label:'External action',detail:operation,kind:'action',state:proof.reconstruction.blackbox_assessment,evidence:'UNVERIFIED'},
    ...downstream,
    {id:'blackbox',label:'Black Box',detail:'External side effect not verified',kind:'system',state:'REVIEWED',evidence:'SYNTHETIC'},
    {id:'spider',label:'Spider Society',detail:clean(proof.spider_society.persistence_signal,120),kind:'system',state:'POSSIBLE',evidence:'SYNTHETIC'},
    {id:'systemia',label:'Systemia',detail:'Mission admission not verified',kind:'system',state:'NOT_ADMITTED',evidence:'SYNTHETIC'},
    {id:'network',label:'Network custody',detail:clean(proof.evercraft_network.continuity_state,120),kind:'system',state:'PENDING',evidence:'SYNTHETIC'}
  ];
  const edges=[
    {from:'agent',to:'operation',relation:'attempted',evidence:'SYNTHETIC'},
    ...downstream.map(n=>({from:'operation',to:n.id,relation:'possible downstream',evidence:'INFERRED'})),
    {from:'blackbox',to:'operation',relation:'evaluates',evidence:'SYNTHETIC'},
    {from:'spider',to:'impact-'+Math.max(0,downstream.findIndex(n=>n.kind==='persistence')),
      relation:'inspects persistence',evidence:'SYNTHETIC',optional:!downstream.some(n=>n.kind==='persistence')},
    {from:'systemia',to:'agent',relation:'governance hold',evidence:'SYNTHETIC'},
    {from:'network',to:'blackbox',relation:'delivery pending',evidence:'SYNTHETIC'}
  ].filter(e=>!e.optional);
  const steps=[
    {id:'01',title:'Worker reaches external action',kind:'ATTEMPT',target:'operation',
     narrative:'Synthetic incident begins during a provider-facing operation. No provider acknowledgment is present.'},
    {id:'02',title:'Worker exits',kind:'FAILURE',target:'agent',
     narrative:'The scenario reports an exit during the external action. An agent report does not prove the provider outcome.'},
    {id:'03',title:'Black Box assesses evidence',kind:'EVIDENCE',target:'blackbox',
     narrative:'Assessment: '+clean(proof.reconstruction.blackbox_assessment,80)+'. External verification is explicitly false.'},
    {id:'04',title:'Spider Society maps possible survivors',kind:'PERSISTENCE',target:'spider',
     narrative:'A retry or callback may persist. This is a hypothesis from the synthetic fixture, not a live scan.'},
    {id:'05',title:'Systemia holds response',kind:'GOVERNANCE',target:'systemia',
     narrative:'Canonical admission and independently authorized action are not established. No containment is performed.'},
    {id:'06',title:'Network receipt remains unverified',kind:'CONTINUITY',target:'network',
     narrative:'The scenario declares pending delivery. It does not demonstrate hardware transfer or durable receipt.'}
  ];
  const synopsis=proof.reconstruction.blackbox_assessment==='UNKNOWN'
    ? 'The agent stopped. The external action is still unknown.'
    : 'The agent stopped. External side effects remain unverified.';
  // Hash the projected packet too, so exports can be compared without exposing source data.
  const packet={
    schema:'evercraft.agent-continuity.visual-ops.v1',
    mode:'SYNTHETIC_REPLAY',read_only:true,live:false,
    proof_state:proof.proof_state,source_sha256:proof.input_sha256,
    incident:{id:incident,mission_id:mission,agent_id:agent,operation_id:operation,occurred_at:when},
    synopsis,assessment:proof.reconstruction.blackbox_assessment,
    external_side_effect_verified:false,
    verified_collateral:0,possible_impacts:downstream.length,
    persistence_signal:clean(proof.spider_society.persistence_signal,120),
    admission:'NOT_ADMITTED',containment_performed:false,
    timeline_kind:'ORDERED_ANALYSIS_NOT_OBSERVED_TIMESTAMPS',
    nodes,edges,steps,
    boundaries:[
      'Synthetic fixture, not live observed incident',
      'Possible graph edges are not confirmed impacts',
      'No provider-authenticated readback',
      'No live Spider scan or containment',
      'No Network physical delivery verification',
      'No Systemia admission or permission to act'
    ]
  };
  packet.projection_sha256=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
  return packet;
}
