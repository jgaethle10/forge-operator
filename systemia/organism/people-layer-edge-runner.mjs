#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { EvercraftHostingControlPlane } from '../compute/hosting-control-plane.mjs';
import { peopleLayerServiceSpec } from '../people/hosting.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function releaseRef(){
  const explicit=String(process.env.EVERCRAFT_RELEASE_REF||'').trim();
  if(/^[a-f0-9]{40}$/i.test(explicit))return explicit;
  try{
    const value=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(/^[a-f0-9]{40}$/i.test(value))return value;
  }catch{}
  throw new Error('immutable_release_ref_unavailable');
}

const sharedStateRoot=path.resolve(
  process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR||
  'artifacts/public-edge-activation-watch/runtime'
);
const yardState=path.resolve(arg('--yard-state',path.join(sharedStateRoot,'yard')));
const hostingState=path.resolve(arg('--hosting-state',path.join(sharedStateRoot,'people-hosting')));
const peopleStateRaw=String(arg('--people-state',process.env.PEOPLE_STATE_DIR||'')||'').trim();
const adminAuthorityRaw=String(arg('--admin-token-file',process.env.PEOPLE_ADMIN_TOKEN_FILE||'')||'').trim();
const mailPublicKeysRaw=String(arg('--mail-public-keys',process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE||'')||'').trim();
if(!peopleStateRaw)throw new Error('people_state_dir_required');
if(!adminAuthorityRaw)throw new Error('people_admin_token_file_required');
if(!mailPublicKeysRaw)throw new Error('people_mail_public_keys_file_required');
const peopleState=path.resolve(peopleStateRaw);
const adminAuthorityFile=path.resolve(adminAuthorityRaw);
const mailPublicKeysFile=path.resolve(mailPublicKeysRaw);
const hostname=String(arg('--hostname',process.env.PEOPLE_YARD_HOSTNAME||'people'));
const intervalMs=Math.max(5000,Number(arg('--interval-ms','60000')));
const release=releaseRef();
let timer=null;
let inFlight=false;
let closing=false;
let lastState='';

process.env.PEOPLE_STATE_DIR=peopleState;
process.env.PEOPLE_ADMIN_TOKEN_FILE=adminAuthorityFile;
process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE=mailPublicKeysFile;

function emit(payload){
  console.log(JSON.stringify({
    schema:'evercraft.people.edge-runner.v1',
    owner:'systemia',
    founder_login_required:false,
    base44_runtime_required:false,
    ...payload,
  }));
}

async function reconcile(){
  if(closing||inFlight)return;
  inFlight=true;
  try{
    const yard=new YardOperator({stateDir:yardState});
    const edge=yard.deploymentStatus('evercraft-public-edge');
    if(!edge||edge.state!=='ready'){
      if(lastState!=='held_waiting_for_public_edge'){
        lastState='held_waiting_for_public_edge';
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }

    const hosting=new EvercraftHostingControlPlane({
      yard,
      stateDir:hostingState,
      allowLoopbackProof:false,
    });
    const spec=peopleLayerServiceSpec(release,{hostname});
    const result=await hosting.apply(spec);
    lastState=result.state;
    emit({
      ok:true,
      state:result.state,
      action:result.action,
      origin:result.route?.origin||null,
      route_verified:result.route?.verified===true,
      deployment_id:result.active_deployment_id||null,
      release_ref:result.active_release_ref||null,
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
  if(closing)return;
  closing=true;
  if(timer)clearInterval(timer);
  clearInterval(keepAlive);
  emit({ok:true,state:'stopped',managed_runtime_left_running:true,retrying:false});
  process.exit(0);
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
