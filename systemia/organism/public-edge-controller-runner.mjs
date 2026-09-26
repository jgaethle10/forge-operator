#!/usr/bin/env node
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { PublicEdgeController } from '../yard/public-edge-controller.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

function required(name){
  const value=String(arg(name,'')||'').trim();
  if(!value) throw new Error(name+' is required');
  return value;
}

const yardState=path.resolve(required('--yard-state'));
const controllerState=path.resolve(required('--controller-state'));
const leaseTtlMs=Number(arg('--lease-ttl-ms','3600000'));
const renewEveryMs=Number(arg('--renew-every-ms','1800000'));
const intervalMs=Number(arg('--interval-ms','60000'));

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
  console.log(JSON.stringify({
    schema:'evercraft.yard.public-edge-controller-runner.v1',
    ok:true,
    state:'held_waiting_for_activation_watch',
    activation_owner:'public-edge-activation-watch',
    maintenance_owner:'public-edge-controller',
    founder_login_required:false,
    payment_authority:false,
  },null,2));
  process.exit(0);
}

let startup;
try{
  startup=await controller.resume({rebindIfNeeded:true});
}catch(error){
  console.error(JSON.stringify({
    schema:'evercraft.yard.public-edge-controller-runner.v1',
    ok:false,
    state:'resume_failed',
    activation_owner:'public-edge-activation-watch',
    maintenance_owner:'public-edge-controller',
    error:error instanceof Error?error.message:String(error),
    founder_login_required:false,
  },null,2));
  process.exit(2);
}

controller.start({immediate:false});
console.log(JSON.stringify({
  schema:'evercraft.yard.public-edge-controller-runner.v1',
  ok:true,
  state:startup.action,
  origin:startup.origin||null,
  route_scope:startup.route_scope||null,
  route_verified:startup.route_verified===true,
  receipt_hash:startup.receipt_hash,
  activation_owner:'public-edge-activation-watch',
  maintenance_owner:'public-edge-controller',
  founder_login_required:false,
  allocator_secret_persisted_in_controller_state:false,
},null,2));

const keepAlive=setInterval(()=>{},60000);
let closing=false;
const stopForSupervisor=()=>{
  if(closing) return;
  closing=true;
  clearInterval(keepAlive);
  controller.stop();
  yard.stopLeaseKeeper(controller.edgeDeploymentId);
  yard.stopLeaseKeeper(controller.specialistDeploymentId);
  process.exit(0);
};
process.on('SIGTERM',stopForSupervisor);
process.on('SIGINT',stopForSupervisor);
