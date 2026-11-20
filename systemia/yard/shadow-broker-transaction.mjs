#!/usr/bin/env node
/**
 * Journaled zero-authority broker startup/shutdown transaction.
 * Rehearsal-only: physical /var/lib/evercraft is rejected unconditionally.
 * The operator CLI in shadow-broker-one-shot.mjs remains HARD DISABLED.
 * Never enrolls remote devices, opens public ingress, or persists credentials
 * into Yard deployment records.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createShadowLeaseJournal,
  recordShadowLease,
  recordShadowSubmissionIntent,
  releaseShadowLease,
  inspectShadowLeaseJournal,
} from './shadow-broker-lease-journal.mjs';
import {loopbackFromReceipt,verifyCapacity} from './remote-broker-resident.mjs';

const WORKLOAD='systemia.remote-capacity-broker.v1';
const RELEASE='32656150e433db42d00e0725507601dfa1b5641e';

function requireOk(condition,reason){
  if(!condition)throw Error('shadow_transaction_'+reason);
}

function contained(root,target){
  const rel=path.relative(root,target);
  return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);
}

function livePhysicalPath(root){
  const resolved=path.resolve(root);
  return resolved==='/var/lib/evercraft' ||
    resolved.startsWith('/var/lib/evercraft/');
}

async function jsonRequest(request,url,init={}){
  const response=await request(url,{
    ...init,signal:AbortSignal.timeout(4000),
  });
  if(!response.ok)throw Error('remote_request_not_successful');
  return response.json();
}

export async function runRehearsalShadowBrokerTransaction({
  nodeSeedReceipt,
  journalParent,
  allocatorToken,
  request=fetch,
  onBrokerVerified=null,
}={}){
  requireOk(nodeSeedReceipt?.root,'node_seed_receipt_required');
  requireOk(typeof journalParent==='string','journal_parent_required');
  requireOk(typeof allocatorToken==='string'&&allocatorToken.length>0,
    'allocator_token_required');
  requireOk(onBrokerVerified===null||typeof onBrokerVerified==='function',
    'observation_hook_invalid');

  const nodeRoot=fs.realpathSync(nodeSeedReceipt.root);
  const parent=fs.realpathSync(journalParent);
  requireOk(!livePhysicalPath(nodeRoot) && !livePhysicalPath(parent),
    'physical_nodeseed_activation_hard_disabled');
  // A rehearsal root must be an actual temporary fixture, not a copied
  // receipt placed under another real service root.
  const tmp=fs.realpathSync(os.tmpdir());
  requireOk(contained(tmp,nodeRoot) &&
    /^(shadow-|installed-old-compute-)/.test(String(nodeSeedReceipt.node_id||'')),
    'rehearsal_fixture_identity_required');
  requireOk(contained(nodeRoot,parent),'journal_not_inside_node_root');
  requireOk(fs.lstatSync(parent).isDirectory() &&
    (fs.lstatSync(parent).mode&0o077)===0,'journal_root_not_private');

  // Never use caller-supplied metadata to disguise a physical NodeSeed
  // as a disposable fixture. The root must contain this actual receipt.
  const recordedReceipt=JSON.parse(fs.readFileSync(
    path.join(nodeRoot,'nodeseed-receipt.json'),'utf8'
  ));
  requireOk(
    recordedReceipt.root===nodeRoot &&
    recordedReceipt.node_id===nodeSeedReceipt.node_id &&
    recordedReceipt.device_fingerprint===nodeSeedReceipt.device_fingerprint &&
    recordedReceipt.endpoint===nodeSeedReceipt.endpoint,
    'on_disk_nodeseed_receipt_mismatch'
  );
  const origin=loopbackFromReceipt(nodeSeedReceipt);
  // Never let a fabricated disposable receipt target Penguin's actual
  // production NodeSeed endpoint, even if all copied receipt fields agree.
  requireOk(new URL(origin).port!=='42420',
    'live_node_endpoint_not_disposable');
  const capacity=await jsonRequest(request,origin+'/v1/capacity');
  verifyCapacity(nodeSeedReceipt,capacity);

  const journalDir=createShadowLeaseJournal({
    parent,origin,expectedNodeId:nodeSeedReceipt.node_id,
  });

  let recorded=false;
  let brokerResponseReceived=false;
  let verified=false;
  let cleanup=null;
  let failure=null;

  try{
    const lease=await jsonRequest(request,origin+'/v1/leases',{
      method:'POST',
      headers:{
        authorization:'Bearer '+allocatorToken,
        'content-type':'application/json',
      },
      body:JSON.stringify({
        workload_class:WORKLOAD,
        requested_ttl_ms:60_000,
      }),
    });

    recordShadowLease({dir:journalDir,lease});
    recorded=true;
    recordShadowSubmissionIntent({dir:journalDir});

    const job=await jsonRequest(request,origin+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        lease_id:lease.lease_id,
        token:lease.token,
        workload_class:WORKLOAD,
        release_ref:RELEASE,
        input:{
          state_root:path.join(journalDir,'broker-state'),
          port:0,
          authorized_devices:{},
        },
      }),
    });

    const serviceId=String(job?.result?.service_id||'');
    requireOk(/^svc_[a-f0-9]{16}$/i.test(serviceId),
      'service_id_missing');
    brokerResponseReceived=true;

    const health=await jsonRequest(
      request,origin+'/v1/services/'+serviceId+'/health'
    );
    requireOk(health?.ok===true&&
      health.service==='remote-capacity-broker'&&
      health.runtime==='Evercraft Compute'&&
      health.instance_id===job.result.instance_id&&
      health.secure_envelope_schema==='evercraft.secure-envelope.v1'&&
      health.authorized_devices===0&&
      health.registered_nodes===0&&
      health.pending_enrollment_requests===0&&
      health.deployment_receipt_bound===false,
      'zero_authority_or_broker_identity_invalid'
    );
    // Disposable-only observation point: broker exists, NodeSeed still owns
    // its lease, and the finally block MUST run even if observation fails.
    // No lease token, allocator secret or broker instance ID is exposed here.
    if(onBrokerVerified){
      await onBrokerVerified(Object.freeze({
        broker_zero_authority_verified:true,
        public_route_created:false,
      }));
    }
    // This transaction deliberately does NOT bind a Yard deployment receipt.
    // It is a disposable start/stop rehearsal, not a production deployment.
    verified=true;
  }catch(error){
    failure=String(error?.message||'rehearsal_failed').slice(0,120);
  }finally{
    if(recorded){
      try{
        cleanup=await releaseShadowLease({dir:journalDir,request});
      }catch{
        cleanup={ok:false,manual_reconciliation_required:true};
      }
    }
  }

  const journal=inspectShadowLeaseJournal({dir:journalDir});
  return {
    schema:'evercraft.yard.shadow-broker-transaction.v1',
    ok:verified&&cleanup?.ok===true&&!failure,
    broker_start_confirmed_by_response:brokerResponseReceived,
    broker_start_outcome_uncertain:
      !brokerResponseReceived && journal.submission_attempted,
    broker_identity_verified:verified,
    release_confirmed:cleanup?.ok===true,
    journal_phase:journal.phase,
    manual_review_required:
      (recorded && cleanup?.ok!==true) || journal.phase==='manual_hold',
    no_physical_nodeseed_changed:true,
    authorized_devices:0,
    public_route_created:false,
    historical_grants_imported:false,
    failure,
    journal_directory:journalDir,
    secrets_printed:false,
  };
}
