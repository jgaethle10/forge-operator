#!/usr/bin/env node
import fs from 'node:fs';
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

function readSecretFile(file){
  const resolved=path.resolve(file);
  if(!fs.existsSync(resolved)) throw new Error('allocator_token_file_missing');
  const value=fs.readFileSync(resolved,'utf8').trim();
  if(!value) throw new Error('allocator_token_file_empty');
  return value;
}

const yardState=path.resolve(required('--yard-state'));
const controllerState=path.resolve(required('--controller-state'));
const capacityEndpoint=required('--capacity-endpoint');
const releaseRef=required('--release-ref');
const baseDomain=required('--base-domain');
const tlsKeyPath=path.resolve(required('--tls-key-path'));
const tlsCertPath=path.resolve(required('--tls-cert-path'));
const allocatorTokenFile=required('--allocator-token-file');
const requestedHostname=String(arg('--requested-hostname','evercraft-specialists')||'evercraft-specialists');
const gatewayUrl=String(arg(
  '--gateway-url',
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway'
));
const publicPort=Number(arg('--public-port','443'));
const leaseTtlMs=Number(arg('--lease-ttl-ms','3600000'));
const renewEveryMs=Number(arg('--renew-every-ms','1800000'));
const intervalMs=Number(arg('--interval-ms','60000'));

if(!/^[a-f0-9]{40}$/i.test(releaseRef)){
  throw new Error('release_ref_must_be_immutable_sha');
}
if(!/^https?:\/\//i.test(capacityEndpoint)){
  throw new Error('capacity_endpoint_must_be_http_or_https');
}

const allocatorToken=readSecretFile(allocatorTokenFile);
const yard=new YardOperator({stateDir:yardState});
const controller=new PublicEdgeController({
  yard,
  stateDir:controllerState,
  leaseTtlMs,
  renewEveryMs,
  intervalMs,
  allowLoopbackProof:false,
});

let startup;
try{
  const edge=yard.deploymentStatus(controller.edgeDeploymentId);
  const specialist=yard.deploymentStatus(controller.specialistDeploymentId);
  if(
    controller.binding &&
    edge?.state==='ready' &&
    specialist?.state==='ready'
  ){
    startup=await controller.resume({rebindIfNeeded:true});
  }else{
    startup=await controller.provision({
      releaseRef,
      capacityEndpoint,
      allocatorToken,
      edge:{
        mode:'wildcard_https',
        base_domain:baseDomain,
        tls_key_path:tlsKeyPath,
        tls_cert_path:tlsCertPath,
        public_host:'0.0.0.0',
        public_port:publicPort,
      },
      specialist:{
        gateway_url:gatewayUrl,
      },
      requestedHostname,
      edgeRollbackTarget:'none:first_install',
      specialistRollbackTarget:'none:first_install',
    });
  }
}catch(error){
  console.error(JSON.stringify({
    schema:'evercraft.yard.public-edge-controller-runner.v1',
    ok:false,
    state:'startup_failed',
    error:error instanceof Error?error.message:String(error),
    founder_login_required:false,
  }));
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
