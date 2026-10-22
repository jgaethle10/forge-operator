/**
 * Systemia Relationship Command: tenant-scoped read-only customer console.
 * Inputs originate ONLY from a trusted private tenant store and authenticated
 * session. Never accept role, tenant or records as browser-controlled authority.
 */
const SCHEMA='evercraft.crm.customer-workspace.v1';
const ROLES=new Set(['owner','operator','viewer']);
const POLICIES=new Set(['paused','manual_review_only','preflight_eligible']);
const required=(v,name)=>{if(typeof v!=='string'||!v.trim())throw Error(name+'_required');return v.trim();};
const timestamp=(v,name)=>{const n=Date.parse(required(v,name));if(!Number.isFinite(n))throw Error(name+'_invalid');return n;};
function accessCheck({tenantId,access,now}) {
 const tenant=required(tenantId,'tenant_id');
 if(!access||access.tenant_id!==tenant||access.active!==true||!ROLES.has(access.role)||
    !Array.isArray(access.division_ids)||access.division_ids.length===0||
    new Set(access.division_ids).size!==access.division_ids.length||
    !access.division_ids.every(x=>typeof x==='string'&&x.length>0))
   throw Error('workspace_access_denied');
 required(access.actor_ref,'actor_ref');
 if(timestamp(access.expires_at,'access_expires_at')<=now.getTime())throw Error('workspace_access_expired');
 return {tenant,divisions:new Set(access.division_ids),canReadNotes:access.role!=='viewer'};
}
const within=(date,now)=>date&&timestamp(date,'due_at')<=now.getTime();
export function buildCustomerRelationshipWorkspace({
 tenantId='',access=null,records=[],now=new Date()
}={}) {
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('workspace_clock_invalid');
 const scope=accessCheck({tenantId,access,now});
 if(!Array.isArray(records)||records.length>25000)throw Error('workspace_source_invalid');
 const tenantRows=records.filter(r=>r?.tenant_id===scope.tenant);
 const ids=new Set(),crossDivisionHolds=new Set();
 for(const r of tenantRows) {
   const id=required(r.relationship_ref,'relationship_ref');
   if(ids.has(id))throw Error('workspace_relationship_duplicate');ids.add(id);
   required(r.division_id,'division_id');
   required(r.subject_ref,'subject_ref');
   if(!Array.isArray(r.timeline)||r.timeline.length>2000)throw Error('workspace_timeline_invalid');
   if(r.timeline.some(e=>e?.type==='no_contact_requested'))crossDivisionHolds.add(r.subject_ref);
 }
 const visible=tenantRows.filter(r=>scope.divisions.has(r.division_id));
 const items=visible.map(r=>{
   required(r.display_name,'display_name');
   required(r.stage,'relationship_stage');
   required(r.source_ref,'source_ref');
   if(!POLICIES.has(r.outbound_policy))throw Error('workspace_outbound_policy_invalid');
   const observed=timestamp(r.observed_at,'observed_at');
   if(observed>now.getTime()+120000)throw Error('workspace_future_observation');
   const overdue=!!within(r.next_review_at,now)&&
      !['completed','cancelled'].includes(r.next_action_state);
   let contactState='independent_preflight_required';
   if(crossDivisionHolds.has(r.subject_ref))contactState='no_contact_hold';
   else if(r.outbound_policy==='paused')contactState='paused';
   else if(r.outbound_policy==='manual_review_only')contactState='human_review_required';
   const events=r.timeline.map(event=>{
     const base={
       type:required(event.type,'event_type'),
       occurred_at:new Date(timestamp(event.occurred_at,'event_time')).toISOString(),
       evidence_ref:required(event.evidence_ref,'evidence_ref')
     };
     if(scope.canReadNotes&&typeof event.private_context==='string')
       base.context=event.private_context.slice(0,4000);
     return base;
   }).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));
   return {
     relationship_ref:r.relationship_ref,
     division_id:r.division_id,
     display_name:r.display_name,
     kind:typeof r.kind==='string'?r.kind:'other',
     stage:r.stage,
     contact_state:contactState,
     review_state:overdue?'due':'not_due',
     next_review_at:r.next_review_at||null,
     next_action_state:r.next_action_state||'open',
     evidence_state:r.evidence_state||'reported',
     observed_at:r.observed_at,
     source_ref:r.source_ref,
     timeline:events
   };
 });
 items.sort((a,b)=>{
   const d=(a.review_state==='due'?0:1)-(b.review_state==='due'?0:1);
   return d||String(a.next_review_at||'9999').localeCompare(String(b.next_review_at||'9999'))||
      a.relationship_ref.localeCompare(b.relationship_ref);
 });
 const held=items.filter(x=>x.contact_state!=='independent_preflight_required').length;
 return {
   schema:SCHEMA,tenant_id:scope.tenant,generated_at:now.toISOString(),
   actor_role:access.role,division_ids:[...scope.divisions].sort(),
   counts:{relationships:items.length,review_due:items.filter(x=>x.review_state==='due').length,
     contact_held:held,unverified_contact_permits:items.length},
   action_authority:'none',source_state:'private_authenticated_read_only',
   entries:items
 };
}
