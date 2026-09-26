#!/usr/bin/env node
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { PublicEdgeController } from '../yard/public-edge-controller.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

const sharedStateRoot=path.resolve(
  process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR||
  'artifacts/public-edge-activation-watch/runtime'
);
const yardState=path.resolve(arg('--yard-state',path.join(sharedStateRoot,'yard')));
const controllerState=path.resolve(arg('--controller-state',path.join(sharedStateRoot,'controller')));
const leaseTtlMs=Number(arg('--lease-ttl-ms','3600000'));
const renewEveryMs=Number(arg('--renew-every-ms','1800000'));
const intervalMs=Math.max(5000,Number(arg('--interval-ms','60000')));
const attachPollMs=Math.max(100,Number(arg('--attach-poll-ms','5000')));

let active=null;
let attachInFlight=false;
let attachTimer=null;
let closing=false;
let lastState='';

function emit(payload){
  console.log(JSON.stringify({
    schema:'evercraft.yard.public-edge-controller-runner.v1',
    activation_owner:'public-edge-activation-watch',
    maintenance_owner:'public-edge-controller',
    founder_login_required:false,
    payment_authority:false,
    ...payload,
  }));
}

async function attachIfReady(){
  if(closing||active||attachInFlight) return false;
  attachInFlight=true;
  try{
    const yard=new YardOperator({stateDir:yardState});
    const controller=new PublicEdgeController({
      yard,
      stateDir:controllerState,
      leaseTtlMs,
      renewEveryMs,
      intervalMs,
      allowLoopbackProof:false,
    });
    const edge=yard.deploymentStatus(controller.edgeDeploymentId);
    const specialist=yard.deploymentStatus(controller.specialistDeploymentId);

    if(
      !controller.binding ||
      edge?.state!=='ready' ||
      specialist?.state!=='ready'
    ){
      if(lastState!=='held_waiting_for_activation_watch'){
        lastState='held_waiting_for_activation_watch';
        emit({
          ok:true,
          state:lastState,
          resident_process_alive:true,
        });
      }
      return false;
    }

    try{
      const startup=await controller.resume({rebindIfNeeded:true});
      if(closing){
        controller.stop();
        yard.stopLeaseKeeper(controller.edgeDeploymentId);
        yard.stopLeaseKeeper(controller.specialistDeploymentId);
        return false;
      }
      active={yard,controller};
      controller.start({immediate:false});
      lastState='attached';
      emit({
        ok:true,
        state:startup.action,
        origin:startup.origin||null,
        route_scope:startup.route_scope||null,
        route_verified:startup.route_verified===true,
        field_verified:startup.field_verified===true,
        receipt_hash:startup.receipt_hash,
        resident_process_alive:true,
        allocator_secret_persisted_in_controller_state:false,
      });
      return true;
    }catch(error){
      if(lastState!=='resume_failed'){
        lastState='resume_failed';
        emit({
          ok:false,
          state:'resume_failed',
          error:error instanceof Error?error.message:String(error),
          retrying:true,
          resident_process_alive:true,
        });
      }
      return false;
    }
  }finally{
    attachInFlight=false;
  }
}

await attachIfReady();
attachTimer=setInterval(()=>{
  attachIfReady().catch((error)=>{
    if(lastState!=='attach_loop_error'){
      lastState='attach_loop_error';
      emit({
        ok:false,
        state:'attach_loop_error',
        error:error instanceof Error?error.message:String(error),
        retrying:true,
        resident_process_alive:true,
      });
    }
  });
},attachPollMs);
attachTimer.unref?.();

const keepAlive=setInterval(()=>{},60000);

const stopForSupervisor=()=>{
  if(closing) return;
  closing=true;
  clearInterval(keepAlive);
  if(attachTimer) clearInterval(attachTimer);
  if(active){
    active.controller.stop();
    active.yard.stopLeaseKeeper(active.controller.edgeDeploymentId);
    active.yard.stopLeaseKeeper(active.controller.specialistDeploymentId);
  }
  emit({
    ok:true,
    state:'stopped',
    managed_runtime_left_running:true,
    resident_process_alive:false,
  });
  process.exit(0);
};

process.on('SIGTERM',stopForSupervisor);
process.on('SIGINT',stopForSupervisor);
