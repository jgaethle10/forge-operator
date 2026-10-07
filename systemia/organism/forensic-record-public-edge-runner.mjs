#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { ForensicRecordPublicEdgeController } from '../yard/forensic-record-public-edge-controller.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function releaseRef(){
  const explicit=String(process.env.EVERCRAFT_RELEASE_REF||'').trim();
  if(/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try{
    const value=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(/^[a-f0-9]{40}$/i.test(value)) return value;
  }catch{}
  throw new Error('immutable_release_ref_unavailable');
}

const sharedStateRoot=path.resolve(
  process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR||
  'artifacts/public-edge-activation-watch/runtime'
);
const yardState=path.resolve(arg('--yard-state',path.join(sharedStateRoot,'yard')));
const controllerState=path.resolve(arg('--controller-state',path.join(sharedStateRoot,'forensic-record-public-staging')));
const requestedHostname=String(
  arg('--hostname',process.env.FORENSIC_RECORD_STAGING_HOSTNAME||'files-companion-staging')
).trim();
const intervalMs=Math.max(5000,Number(arg('--interval-ms','60000')));
const leaseTtlMs=Math.max(60000,Number(arg('--lease-ttl-ms','3600000')));
const renewEveryMs=Math.max(30000,Number(arg('--renew-every-ms','1800000')));
const release=releaseRef();
let inFlight=false;
let closing=false;
let lastState='';
let timer=null;

function emit(payload){
  console.log(JSON.stringify({
    schema:'evercraft.forensic-record.public-staging-runner.v1',
    owner:'systemia',
    runtime:'Evercraft Compute',
    public_read_only:true,
    canonical_domain_cutover:false,
    legacy_retirement_authorized:false,
    founder_login_required:false,
    allocator_reentry_required:false,
    ...payload,
  }));
}

async function reconcile(){
  if(closing||inFlight) return;
  inFlight=true;
  try{
    const yard=new YardOperator({stateDir:yardState});
    const edge=yard.deploymentStatus('evercraft-public-edge');
    const source=yard.deploymentStatus('forensic-record-runtime');
    if(!edge||edge.state!=='ready'){
      if(lastState!=='held_waiting_for_public_edge'){
        lastState='held_waiting_for_public_edge';
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }
    if(!source||source.state!=='ready'){
      if(lastState!=='held_waiting_for_seeded_forensic_runtime'){
        lastState='held_waiting_for_seeded_forensic_runtime';
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }

    const controller=new ForensicRecordPublicEdgeController({
      yard,
      stateDir:controllerState,
      requestedHostname,
      stableHostname:true,
      leaseTtlMs,
      renewEveryMs,
      allowLoopbackProof:false,
    });
    const current=yard.deploymentStatus(controller.publicDeploymentId);
    const result=current?.state==='ready'
      ? await controller.resume({rebindIfNeeded:true})
      : await controller.provision({
          releaseRef:release,
          requestedHostname,
          stableHostname:true,
          rollbackTarget:'systemia:forensic-record-public-runtime-previous',
        });
    lastState=result.action;
    emit({
      ok:true,
      state:result.action,
      origin:result.origin||null,
      route_scope:result.route_scope||null,
      route_verified:result.route_verified===true,
      public_read_only:true,
      safe_projection:true,
      canonical_domain_cutover:false,
      legacy_retirement_authorized:false,
      receipt_hash:result.receipt_hash,
      retrying:false,
    });
  }catch(error){
    const state='held_reconcile_failed';
    if(lastState!==state){
      lastState=state;
      emit({
        ok:false,
        state,
        error:error instanceof Error?error.message:String(error),
        canonical_domain_cutover:false,
        legacy_retirement_authorized:false,
        retrying:true,
      });
    }
  }finally{
    inFlight=false;
  }
}

await reconcile();
timer=setInterval(()=>reconcile().catch(()=>{}),intervalMs);
timer.unref?.();
const keepAlive=setInterval(()=>{},60000);

function shutdown(){
  if(closing) return;
  closing=true;
  if(timer) clearInterval(timer);
  clearInterval(keepAlive);
  emit({ok:true,state:'stopped',managed_runtime_left_running:true,retrying:false});
  process.exit(0);
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
