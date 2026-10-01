const EPOCH=new Date('2024-01-01T00:00:00.000Z');

function periodStart(value){
  const d=new Date(value);
  d.setUTCHours(0,0,0,0);
  const days=Math.floor((d.getTime()-EPOCH.getTime())/86400000);
  return new Date(EPOCH.getTime()+Math.floor(days/14)*14*86400000);
}
function hoursFor(log){
  if(log?.corrected_hours!=null) return Number(log.corrected_hours)||0;
  if(log?.total_hours!=null) return Number(log.total_hours)||0;
  if(log?.start_time&&log?.end_time){
    const diff=(new Date(log.end_time)-new Date(log.start_time))/3600000;
    return Number.isFinite(diff)&&diff>0?diff:0;
  }
  return 0;
}
function paidHardStop(job){
  return job?.invoice_status==='Paid'||job?.status==='Paid / Closed'||Boolean(job?.payment_received_date);
}
function paymentStateConflict(job){
  const invoicePaid=job?.invoice_status==='Paid';
  const jobClosed=job?.status==='Paid / Closed';
  const received=Boolean(job?.payment_received_date);
  return (invoicePaid&&!jobClosed)||(jobClosed&&!invoicePaid)||(received&&!invoicePaid&&!jobClosed);
}
function verifiedOutstanding(job){
  if(paidHardStop(job)) return false;
  return job?.invoice_status==='Sent'||job?.status==='Invoiced';
}
const sum=(rows,getter)=>rows.reduce((total,row)=>total+(Number(getter(row))||0),0);

export function buildInternalOpsSnapshot({
  entityStore,
  appKey='evercraft-internalops',
  now=new Date()
}={}){
  if(!entityStore) throw new Error('internal_ops_entity_store_required');
  const instant=new Date(now);
  const list=(entity,sort,limit)=>entityStore.list(appKey,entity,{sort,limit});

  const jobs=list('Job','-updated_date',1000);
  const teamMembers=list('TeamMember','-updated_date',500);
  const timeLogs=list('TimeLog','-start_time',2000);
  const workerPayments=list('WorkerPayment','-payment_date',1000);
  const expenses=list('ExpenseSubmission','-updated_date',1000);
  const reimbPayments=list('ReimbursementPayment','-payment_date',1000);
  const leads=list('LeadCapture','-captured_at',1000);
  const events=list('CalendarEvent','-start_time',1000);

  const currentPeriod=periodStart(instant);
  const next48=new Date(instant.getTime()+48*3600000);
  const memberById=new Map(teamMembers.map((m)=>[m.id,m]));
  const activeJobs=jobs.filter((j)=>['Scheduled','In Progress'].includes(j.status));
  const readyToInvoice=jobs.filter((j)=>j.status==='Completed'&&j.invoice_status==='Not Sent');
  const outstanding=jobs.filter(verifiedOutstanding);
  const reconciliationHolds=jobs.filter(paymentStateConflict);

  const currentLogs=timeLogs.filter((l)=>
    l.start_time&&periodStart(new Date(l.start_time)).toISOString()===currentPeriod.toISOString()
  );
  const clockedIn=timeLogs.filter((l)=>l.is_clocked_in===true);
  const submitted=currentLogs.filter((l)=>l.status==='Submitted'&&!l.is_clocked_in);
  const approvedUnpaid=currentLogs.filter((l)=>l.status==='Approved'&&!l.is_clocked_in);
  const approvedUnpaidGross=sum(
    approvedUnpaid,
    (l)=>hoursFor(l)*Number(memberById.get(l.team_member_id)?.hourly_rate||0)
  );

  const linkedLogIds=new Set(
    workerPayments.flatMap((p)=>Array.isArray(p.linked_log_ids)?p.linked_log_ids:[])
  );
  const paidWithoutPayment=currentLogs.filter((l)=>l.status==='Paid'&&!linkedLogIds.has(l.id));
  const correctedUnapproved=timeLogs.filter((l)=>{
    const corrected=Boolean(l.correction_reason&&(l.corrected_hours!=null||l.corrected_start_time));
    return corrected&&!['Approved','Paid'].includes(l.status);
  });

  const openExpenses=expenses.filter((e)=>
    ['Submitted','Under Review','Approved','Partially Reimbursed'].includes(e.status)
  );
  const reimbursementBalance=sum(openExpenses,(e)=>
    e.remaining_reimbursement_balance!=null
      ?Number(e.remaining_reimbursement_balance||0)
      :Math.max(Number(e.approved_amount||e.requested_amount||0)-Number(e.reimbursed_amount_total||0),0)
  );

  const leadStatuses=new Set(['New Lead','Contact Needed','Follow-Up Needed','New']);
  const openLeads=leads.filter((l)=>leadStatuses.has(l.status));
  const upcomingEvents=events.filter((e)=>{
    if(!e.start_time||e.status==='canceled') return false;
    const start=new Date(e.start_time);
    return start>=instant&&start<=next48;
  });

  return {
    ok:true,
    contract:'eps_systemia_read_only_snapshot_v1',
    source_product:'evercraft-internalops',
    generated_at:instant.toISOString(),
    authority:{
      read_only:true,
      contains_personal_contact_data:false,
      contains_tax_or_payment_account_data:false,
      may_authorize_mutation:false,
      execution_authority_granted:false,
      note:'Aggregate decision support only. Consequential actions remain in explicit human-controlled workflows.'
    },
    jobs:{
      active_or_scheduled:activeJobs.length,
      ready_to_invoice_count:readyToInvoice.length,
      ready_to_invoice_value:sum(readyToInvoice,(j)=>Number(j.revenue||0)),
      verified_outstanding_count:outstanding.length,
      verified_outstanding_value:sum(outstanding,(j)=>Number(j.invoice_amount||0)),
      payment_state_reconciliation_holds:reconciliationHolds.length
    },
    crew:{
      active_team_members:teamMembers.filter((m)=>m.active_status==='Active').length,
      clocked_in_now:clockedIn.length,
      current_period_submitted_logs:submitted.length,
      current_period_approved_unpaid_logs:approvedUnpaid.length,
      current_period_approved_unpaid_hours:Number(sum(approvedUnpaid,hoursFor).toFixed(2)),
      current_period_approved_unpaid_gross:Number(approvedUnpaidGross.toFixed(2))
    },
    payroll_integrity:{
      action_gate:paidWithoutPayment.length>0||correctedUnapproved.length>0?'hold':'clear',
      current_period_paid_logs_without_linked_payment:paidWithoutPayment.length,
      corrected_unapproved_logs:correctedUnapproved.length,
      current_period_start:currentPeriod.toISOString()
    },
    reimbursements:{
      open_items:openExpenses.length,
      open_balance:Number(reimbursementBalance.toFixed(2)),
      payment_records_observed:reimbPayments.length
    },
    pipeline:{
      leads_needing_contact_or_followup:openLeads.length,
      events_next_48h:upcomingEvents.length
    },
    record_counts:{
      jobs:jobs.length,
      team_members:teamMembers.length,
      time_logs:timeLogs.length,
      worker_payments:workerPayments.length,
      expenses:expenses.length,
      reimbursement_payments:reimbPayments.length,
      leads:leads.length,
      calendar_events:events.length
    }
  };
}

export function assertInternalOpsSnapshotAuthority(snapshot){
  if(snapshot?.contract!=='eps_systemia_read_only_snapshot_v1') throw new Error('internal_ops_snapshot_contract_invalid');
  const a=snapshot?.authority||{};
  if(a.read_only!==true) throw new Error('internal_ops_snapshot_not_read_only');
  if(a.contains_personal_contact_data!==false) throw new Error('internal_ops_snapshot_personal_data_forbidden');
  if(a.contains_tax_or_payment_account_data!==false) throw new Error('internal_ops_snapshot_financial_account_data_forbidden');
  if(a.may_authorize_mutation!==false||a.execution_authority_granted!==false){
    throw new Error('internal_ops_snapshot_authority_expansion');
  }
  return true;
}
