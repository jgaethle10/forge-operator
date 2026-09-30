#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { RivetReportEdgeController } from '../yard/rivet-report-edge-controller.mjs';

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
const controllerState=path.resolve(arg('--controller-state',path.join(sharedStateRoot,'rivet-report-controller')));
const sourceUrl=String(arg('--source-url',process.env.ALIEV_YARD_SOURCE_URL||'')).trim();
const requestedHostname=String(process.env.RIVET_YARD_HOSTNAME||'rivet-reports');
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
    schema:'evercraft.rivet.report-edge-runner.v1',
    owner:'systemia',
    founder_login_required:false,
    allocator_reentry_required:false,
    allocator_authority_exposed:false,
    ...payload,
  }));
}

function ownedAliEvSourceReady(value){
  if(!value) return {ok:true,reason:null,mode:'embedded_owned'};
  try{
    const parsed=new URL(value);
    if(/(^|\.)base44\.app$/i.test(parsed.hostname)){
      return {ok:false,reason:'owned_aliev_source_must_not_use_base44'};
    }
    const loopback=['127.0.0.1','localhost','::1'].includes(parsed.hostname);
    if(parsed.protocol!=='https:'&&!loopback){
      return {ok:false,reason:'owned_aliev_source_must_use_https'};
    }
    return {ok:true,reason:null,mode:'explicit_owned_url'};
  }catch{
    return {ok:false,reason:'owned_aliev_source_url_invalid'};
  }
}

async function reconcile(){
  if(closing||inFlight) return;
  inFlight=true;
  try{
    const sourceGate=ownedAliEvSourceReady(sourceUrl);
    if(!sourceGate.ok){
      if(lastState!==sourceGate.reason){
        lastState=sourceGate.reason;
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }
    const yard=new YardOperator({stateDir:yardState});
    const controller=new RivetReportEdgeController({
      yard,
      stateDir:controllerState,
      requestedHostname,
      stableHostname:true,
      leaseTtlMs,
      renewEveryMs,
      allowLoopbackProof:false,
    });
    const edge=yard.deploymentStatus(controller.edgeDeploymentId);
    if(!edge||edge.state!=='ready'){
      if(lastState!=='held_waiting_for_public_edge'){
        lastState='held_waiting_for_public_edge';
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }

    const rivet=yard.deploymentStatus(controller.rivetDeploymentId);
    let result;
    if(rivet?.state==='ready'){
      result=await controller.resume({rebindIfNeeded:true});
    }else{
      result=await controller.provision({
        releaseRef:release,
        sourceUrl,
        requestedHostname,
        stableHostname:true,
        rollbackTarget:'systemia:rivet-report-edge-previous',
      });
    }
    lastState=result.action;
    emit({
      ok:true,
      state:result.action,
      origin:result.origin||null,
      route_scope:result.route_scope||null,
      route_verified:result.route_verified===true,
      authenticated_report_api:result.authenticated_report_api===true,
      source_mode:sourceGate.mode||'embedded_owned',
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
