#!/usr/bin/env node
/**
 * First real commissioned-agent canary entry point.
 * This runner signs NOTHING and cannot enroll, fabricate, spawn, or rename
 * an agent. It requires fresh, pinned source evidence and calls only an
 * operator-authorized loopback inference gateway with an enabled receiver.
 *
 * A verified single worker is not a completed Saban formation. Juniper
 * memory writeback and synthesis remain independent gates.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createOwnedCommissionedWorkerProofStore,
  createOwnedCommissionedTeamGate } from "../agent-continuity/owned-proof-source.mjs";
import { verifySignedAgentEvidence } from "../agent-continuity/signed-evidence.mjs";
import { verifyCommissionedRoster } from "../agent-continuity/signed-roster.mjs";
import { verifyCommissionedWorkerExecution } from "../agent-continuity/worker-evidence.mjs";
import { createHttpInferenceAdapter } from "./team-review-runtime.mjs";

const txt=(v)=>String(v??"").trim();
const sha=(v)=>"sha256:"+crypto.createHash("sha256").update(txt(v)).digest("hex");
function privateFile(p, label){
  if(!txt(p))throw Error(label+"_missing");
  const abs=path.resolve(txt(p));
  const st=fs.lstatSync(abs);
  if(!st.isFile()||st.isSymbolicLink()||
     (st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
    throw Error(label+"_owner_or_permissions_invalid");
  return abs;
}
function readPrivateJson(p,label){return JSON.parse(fs.readFileSync(privateFile(p,label),"utf8"));}
function hold(reason){return {status:"held",reason,worker_execution_verified:false,full_team_completed:false,
  external_side_effects_authorized:false};}

export async function runFirstCommissionedCanary({
  canary, evidenceDir, trustKeysFile,
  inferenceOrigin="http://127.0.0.1:4322",
  inferenceTokenFile,
  execute=false,
  inferenceAdapter=null,
  now=()=>new Date(),
}={}){
  if(canary?.schema!=="evercraft.raven.commissioned-single-worker-canary.v1"||
     !txt(canary?.request_id)||!txt(canary?.mission_key)||
     !txt(canary?.work_key)||!txt(canary?.reviewer_id)||
     !txt(canary?.agent_id)||!txt(canary?.input)||
     txt(canary?.input).length>8000||
     ["juniper","sentinel"].includes(txt(canary?.agent_id).toLowerCase())||
     canary?.internal_analysis_only!==true||
     canary?.no_external_actions!==true)
    return hold("commissioned_single_worker_canary_scope_invalid");
  const url=new URL(inferenceOrigin);
  if(url.protocol!=="http:"||!["127.0.0.1","localhost","::1"].includes(url.hostname)||
     url.username||url.password||url.pathname!=="/"||url.search||url.hash)
    return hold("commissioned_canary_gateway_must_be_local_loopback");

  let trust,store,evidence;
  try{
    trust=readPrivateJson(trustKeysFile,"commissioned_trust_keys");
    // Constructor refuses shared registry/dispatch keys and non-independent
    // per-agent keys; it never consumes a nonce or starts compute.
    createOwnedCommissionedTeamGate({
      evidenceDir,trustKeysFile,now,
    });
    store=createOwnedCommissionedWorkerProofStore({evidenceDir,trustKeysFile,now});
    evidence=await store.readEvidence({request:{request_id:canary.request_id}});
  }catch{return hold("commissioned_owned_evidence_or_trust_unavailable");}

  const preflightEnvelope=evidence.preflightEnvelope;
  if(!verifySignedAgentEvidence({
    envelope:preflightEnvelope,kind:"dispatch_preflight",
    trustedKeys:trust,now:now(),
  }))return hold("commissioned_preflight_signature_invalid");
  const p=preflightEnvelope.payload||{};
  if(p.request_id!==canary.request_id||
     p.mission_key!==canary.mission_key||
     p.work_key!==canary.work_key||
     p.reviewer_assignments?.[canary.reviewer_id]!==canary.agent_id||
     !Array.isArray(p.role_ids)||!p.role_ids.includes(canary.agent_id)||
     !txt(p.preflight_id)||!txt(p.passport_receipt_ref)||
     !txt(p.execution_gate_receipt_ref)||
     p.juniper?.memory_read!=="passed"||!txt(p.juniper?.read_receipt_ref)||
     p.sentinel?.guard!=="passed"||!txt(p.sentinel?.guard_receipt_ref))
    return hold("commissioned_canary_preflight_identity_dna_or_authority_invalid");
  const request={
    request_id:canary.request_id,
    mission_key:canary.mission_key,work_key:canary.work_key,
    assigned_agents:p.role_ids,
  };
  const roster=verifyCommissionedRoster({
    request,preflightEvidence:preflightEnvelope,
    rosterEnvelope:evidence.rosterEnvelope,trustedKeys:trust,now:now(),
  });
  if(roster.verified!==true)return hold(roster.reason||"commissioned_canary_registry_unverified");
  if(!execute){
    return {
      ...hold("commissioned_canary_not_executed_without_explicit_flag"),
      preflight_signature_verified:true,
      current_roster_signature_verified:true,
      assigned_current_role_id:canary.agent_id,
    };
  }

  let adapter=inferenceAdapter;
  try{
    if(!adapter){
      const token=fs.readFileSync(privateFile(inferenceTokenFile,"inference_token"),"utf8").trim();
      if(Buffer.byteLength(token,"utf8")<32)
        return hold("commissioned_inference_token_invalid");
      adapter=createHttpInferenceAdapter({origin:url.origin,token});
    }
    if(typeof adapter?.inferCommissioned!=="function")
      return hold("commissioned_owned_worker_transport_missing");

    const inference=await adapter.inferCommissioned({
      request_id:canary.request_id+":"+canary.reviewer_id,
      role:canary.reviewer_id,
      prompt:txt(canary.input),
      agent_id:canary.agent_id,
      mission_key:canary.mission_key,
      work_key:canary.work_key,
      preflight_id:p.preflight_id,
      registry_snapshot_hash:roster.digest,
    });
    const worker=await store.readWorkerExecution({
      request,reviewerId:canary.reviewer_id,
    });
    const result=verifyCommissionedWorkerExecution({
      request,preflight:{
        allowed:true,preflight_id:p.preflight_id,
        registry_snapshot_hash:roster.digest,
        reviewer_assignments:p.reviewer_assignments,
      },
      reviewerId:canary.reviewer_id,inference,
      evidence:worker,trustedKeys:trust,now:now(),
    });
    if(result.verified!==true)return hold(result.reason||"commissioned_worker_proof_invalid");
    return {
      schema:"evercraft.raven.first-commissioned-canary-receipt.v1",
      status:"verified_single_worker_execution",
      request_id:canary.request_id,mission_key:canary.mission_key,
      work_key:canary.work_key,
      agent_id:result.agent_id,reviewer_id:result.reviewer_id,
      provider_receipt:inference.provider_receipt,
      worker_run_receipt_ref:result.worker_run_receipt_ref,
      worker_instance_id:result.worker_instance_id,
      result_sha256:sha(inference.text),
      current_roster_digest:roster.digest,
      worker_execution_verified:true,
      full_team_completed:false,
      juniper_writeback_verified:false,
      external_side_effects_authorized:false,
    };
  }catch(e){
    return hold("commissioned_canary_gateway_or_worker_evidence_unavailable:"+
      txt(e?.message||e).slice(0,130));
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  const flag=(name)=>args.includes(name)?args[args.indexOf(name)+1]:"";
  try{
    const result=await runFirstCommissionedCanary({
      canary:readPrivateJson(flag("--request"),"canary_request"),
      evidenceDir:flag("--evidence-dir"),
      trustKeysFile:flag("--trust-keys"),
      inferenceTokenFile:flag("--inference-token-file"),
      inferenceOrigin:flag("--origin")||"http://127.0.0.1:4322",
      execute:args.includes("--execute"),
    });
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(result.status!=="verified_single_worker_execution")process.exitCode=2;
  }catch(e){
    process.stderr.write(JSON.stringify(hold(
      "commissioned_canary_configuration_invalid:"+txt(e?.message||e).slice(0,130)
    ))+"\n");
    process.exitCode=2;
  }
}
