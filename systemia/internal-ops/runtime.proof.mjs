#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { buildInternalOpsSnapshot, assertInternalOpsSnapshotAuthority } from './snapshot.mjs';
import { InternalOpsSnapshotIngress } from './snapshot-ingress.mjs';
import { materializeInternalOpsIntake } from './intake.mjs';
import { pushInternalOpsSnapshot } from './systemia-sync.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-internalops-proof-'));
const now=new Date('2026-10-01T16:00:00.000Z');
const appKey='evercraft-internalops';

try{
  const store=new DurableEntityStore({stateDir:path.join(root,'entities')});
  store.create(appKey,'TeamMember',{id:'tm-1',active_status:'Active',hourly_rate:25});
  store.create(appKey,'Job',{id:'job-active',status:'In Progress',invoice_status:'Not Sent',revenue:5000});
  store.create(appKey,'Job',{id:'job-invoice',status:'Completed',invoice_status:'Not Sent',revenue:1200});
  store.create(appKey,'Job',{id:'job-outstanding',status:'Invoiced',invoice_status:'Sent',invoice_amount:900});
  store.create(appKey,'Job',{id:'job-conflict',status:'Completed',invoice_status:'Paid',invoice_amount:700});
  store.create(appKey,'TimeLog',{
    id:'log-approved',team_member_id:'tm-1',start_time:'2026-09-29T08:00:00.000Z',
    end_time:'2026-09-29T12:00:00.000Z',status:'Approved',is_clocked_in:false,total_hours:4
  });
  store.create(appKey,'TimeLog',{
    id:'log-paid-unlinked',team_member_id:'tm-1',start_time:'2026-09-29T13:00:00.000Z',
    end_time:'2026-09-29T15:00:00.000Z',status:'Paid',is_clocked_in:false,total_hours:2
  });
  store.create(appKey,'ExpenseSubmission',{id:'exp-1',status:'Approved',approved_amount:100,reimbursed_amount_total:25});
  store.create(appKey,'ReimbursementPayment',{id:'rp-1',payment_date:'2026-09-29'});
  store.create(appKey,'LeadCapture',{id:'lead-existing',status:'Contact Needed',captured_at:'2026-10-01T12:00:00Z'});
  store.create(appKey,'CalendarEvent',{id:'event-1',start_time:'2026-10-02T10:00:00Z',status:'scheduled'});

  const snapshot=buildInternalOpsSnapshot({entityStore:store,appKey,now});
  assertInternalOpsSnapshotAuthority(snapshot);
  assert.equal(snapshot.source_product,'evercraft-internalops');
  assert.equal(snapshot.authority.execution_authority_granted,false);
  assert.equal(snapshot.jobs.active_or_scheduled,1);
  assert.equal(snapshot.jobs.ready_to_invoice_count,1);
  assert.equal(snapshot.jobs.verified_outstanding_count,1);
  assert.equal(snapshot.jobs.payment_state_reconciliation_holds,1);
  assert.equal(snapshot.crew.active_team_members,1);
  assert.equal(snapshot.reimbursements.open_balance,75);
  assert.equal(snapshot.pipeline.leads_needing_contact_or_followup,1);
  assert.equal(snapshot.pipeline.events_next_48h,1);

  const admission={
    mission_key:'mission-proof',
    dispatch_order_id:'dispatch-proof',
    authority_receipt_ref:'receipt:systemia:proof',
    execution_authority_granted:false
  };
  const leadIntake=materializeInternalOpsIntake({
    entityStore:store,appKey,admission,now,
    body:{
      idempotency_key:'intake-proof-1',
      request_type:'estimate_request',
      source_channel:'voice',
      full_name:'Proof Customer',
      phone:'509-555-0111',
      email:'proof@example.invalid',
      address:'100 Proof Ave',
      city:'Yakima',state:'WA',zip:'98901',
      service_type:'Tree service',
      summary:'Needs an estimate.',
      evidence_refs:['voice:proof']
    }
  });
  assert.equal(leadIntake.duplicate,false);
  assert.equal(leadIntake.human_gate_required,false);
  assert.ok(leadIntake.lead_id);
  assert.equal(leadIntake.execution_authority_granted,false);

  const duplicate=materializeInternalOpsIntake({
    entityStore:store,appKey,admission,now,
    body:{idempotency_key:'intake-proof-1',request_type:'estimate_request'}
  });
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.work_request_id,leadIntake.work_request_id);

  const restricted=materializeInternalOpsIntake({
    entityStore:store,appKey,admission,now,
    body:{
      idempotency_key:'intake-proof-payment',
      request_type:'payment_question',
      source_channel:'web',
      full_name:'Payment Question',
      email:'payer@example.invalid',
      summary:'Change the amount charged.'
    }
  });
  assert.equal(restricted.human_gate_required,true);
  assert.equal(restricted.risk_class,'restricted');
  assert.equal(restricted.status,'waiting_human');
  assert.equal(restricted.lead_id,null);
  const restrictedRequest=store.get(appKey,'WorkRequest',restricted.work_request_id);
  assert.equal(restrictedRequest.execution_authority_granted,false);

  await assert.rejects(
    ()=>Promise.resolve(materializeInternalOpsIntake({
      entityStore:store,appKey,now,
      admission:{...admission,execution_authority_granted:true},
      body:{idempotency_key:'bad-authority',request_type:'other'}
    })),
    /internal_ops_intake_execution_authority_forbidden/
  );

  const ingress=new InternalOpsSnapshotIngress({
    stateDir:path.join(root,'ingress'),
    clock:()=>now
  });
  const pushed=await pushInternalOpsSnapshot({
    entityStore:store,ingress,appKey,now,
    actorRef:'admin-proof',
    sourceCheckpointId:'checkpoint-proof',
    authorizeAdmin:async({actorRef,operation})=>
      actorRef==='admin-proof'&&operation==='push_systemia_snapshot'
  });
  assert.equal(pushed.pushed,true);
  assert.equal(pushed.network_hop_required,false);
  assert.equal(pushed.execution_authority_granted,false);
  assert.match(pushed.payload_hash,/^sha256:[a-f0-9]{64}$/);

  const pushedAgain=await pushInternalOpsSnapshot({
    entityStore:store,ingress,appKey,now,
    actorRef:'admin-proof',
    sourceCheckpointId:'checkpoint-proof',
    authorizeAdmin:async()=>true
  });
  assert.equal(pushedAgain.duplicate,true);
  assert.equal(pushedAgain.systemia_snapshot_key,pushed.systemia_snapshot_key);

  await assert.rejects(
    ()=>pushInternalOpsSnapshot({
      entityStore:store,ingress,appKey,now,
      actorRef:'not-admin',
      authorizeAdmin:async()=>false
    }),
    /internal_ops_admin_required/
  );

  const stored=ingress.getSnapshot(pushed.systemia_snapshot_key);
  assert.equal(stored.snapshot.contract,'eps_systemia_read_only_snapshot_v1');
  assert.equal(stored.execution_authority_granted,false);

  const serialized=JSON.stringify(stored);
  assert.equal(serialized.includes('proof@example.invalid'),false);
  assert.equal(serialized.includes('509-555-0111'),false);

  console.log(JSON.stringify({
    schema:'evercraft.internal-ops.runtime-proof.v1',
    status:'pass',
    aggregate_snapshot_parity:true,
    snapshot_personal_contact_data_absent:true,
    payment_reconciliation_hold_preserved:true,
    systemia_intake_idempotent:true,
    restricted_requests_human_gated:true,
    intake_grants_no_execution_authority:true,
    direct_owned_snapshot_ingress:true,
    self_http_hop_removed:true,
    systemia_http_hop_removed:true,
    snapshot_ingress_idempotent:true,
    admin_gate_preserved:true,
    source_platform_dependency:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
