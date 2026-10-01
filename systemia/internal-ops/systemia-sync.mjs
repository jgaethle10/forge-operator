import { buildInternalOpsSnapshot, assertInternalOpsSnapshotAuthority } from './snapshot.mjs';

const MISSION_KEY='evercraft-internalops-operations-nexus-v1';
function clean(value,max=4000){return String(value??'').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,max)}

export async function pushInternalOpsSnapshot({
  entityStore,
  ingress,
  authorizeAdmin,
  actorRef,
  sourceCheckpointId='',
  appKey='evercraft-internalops',
  now=new Date()
}={}){
  if(!entityStore) throw new Error('internal_ops_entity_store_required');
  if(!ingress||typeof ingress.ingest!=='function') throw new Error('internal_ops_snapshot_ingress_required');
  if(typeof authorizeAdmin!=='function') throw new Error('internal_ops_admin_authorizer_required');
  const actor=clean(actorRef,255);
  if(!actor) throw new Error('internal_ops_actor_required');
  const admitted=await authorizeAdmin({actorRef:actor,operation:'push_systemia_snapshot'});
  if(admitted!==true) throw new Error('internal_ops_admin_required');

  const snapshot=buildInternalOpsSnapshot({entityStore,appKey,now});
  assertInternalOpsSnapshotAuthority(snapshot);
  const result=ingress.ingest({
    missionKey:MISSION_KEY,
    sourceCheckpointId:clean(sourceCheckpointId,220),
    snapshot
  });
  if(result?.ok!==true||result?.accepted!==true) throw new Error('internal_ops_snapshot_ingress_rejected');

  return {
    ok:true,
    pushed:true,
    generated_at:snapshot.generated_at,
    systemia_snapshot_key:result.snapshot_key,
    systemia_receipt_key:result.receipt_key,
    systemia_receipt_hash:result.receipt_hash||null,
    payload_hash:result.payload_hash,
    duplicate:Boolean(result.duplicate),
    authority:'read_only_aggregate',
    network_hop_required:false,
    execution_authority_granted:false,
    note:'Aggregate snapshot admitted directly to owned Systemia ingress. No InternalOps mutation occurred.'
  };
}
