import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const INPUT_SCHEMA = 'evercraft.crm.heartbeat-input.v1';
const DOMAINS = new Set(['relationships','revenue','payments','fulfillment','service','support','partnerships','talent','marketing','compliance','operations']);
const KINDS = new Set(['reply_waiting','commitment_overdue','opportunity_due','stage_stalled','invoice_overdue','payment_verification_gap','checkout_gap','delivery_due','service_due','support_overdue','renewal_due','relationship_risk','consent_block','source_sync_gap','handoff_missing','partner_followup','attribution_gap','contract_due','other_review']);
const STATES = new Set(['current','stale','unavailable','unauthorized']);
const EVIDENCE = new Set(['verified','reported','modeled','unknown']);
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const str = v => typeof v === 'string' ? v.trim() : '';
function need(v, name) { if (!str(v)) throw Error(name+'_required'); return str(v); }
function time(v, name) { const ms = Date.parse(need(v,name)); if(!Number.isFinite(ms)) throw Error(name+'_invalid'); return ms; }
function fresh(ms, now, ttl) { return ms <= now + 120000 && now - ms <= ttl; }

// Sanitized relationship intelligence: no names, raw subject IDs, email,
// personal notes, invoice amounts or action permits ever enter public artifacts.
export function buildCrmHeartbeat(input, { now = new Date(), maxAgeSeconds = 900 } = {}) {
  if (input?.schema !== INPUT_SCHEMA) throw Error('crm_schema_invalid');
  if (input.tenant_id !== 'evercraft') throw Error('crm_tenant_invalid');
  const nowMs = now.getTime();
  if(!Number.isFinite(nowMs)) throw Error('clock_invalid');
  if(!fresh(time(input.generated_at,'generated_at'),nowMs,maxAgeSeconds*1000)) throw Error('crm_source_stale_or_future');
  need(input.source_revision,'source_revision');
  if(!Array.isArray(input.connectors) || input.connectors.length===0 || input.connectors.length>150) throw Error('crm_connectors_invalid');
  if(!Array.isArray(input.signals) || input.signals.length>50000) throw Error('crm_signals_invalid');
  const sources=new Set(); const health={current:0,stale:0,unavailable:0,unauthorized:0}; let gaps=0;
  for(const item of input.connectors) {
    const key=need(item?.source_key,'source_key');
    if(sources.has(key)) throw Error('crm_connector_duplicate'); sources.add(key);
    if(!STATES.has(item.state)) throw Error('crm_connector_state_invalid');
    health[item.state]++;
    if(item.state==='current') {
      if(!fresh(time(item.checked_at,'checked_at'),nowMs,maxAgeSeconds*1000)) throw Error('crm_connector_claimed_current_but_stale');
      need(item.evidence_ref,'connector_evidence_ref');
    } else gaps++;
  }
  const seen=new Set(),domains={},evidence={verified:0,reported:0,modeled:0,unknown:0},
    attention={critical:0,high:0,normal:0};
  let open=0, held=0, due=0;
  for(const s of input.signals) {
    const key=need(s?.signal_key,'signal_key');
    if(seen.has(key)) throw Error('crm_signal_duplicate'); seen.add(key);
    if(!DOMAINS.has(s.domain)) throw Error('crm_signal_domain_invalid');
    if(!KINDS.has(s.kind)) throw Error('crm_signal_kind_invalid');
    if(!EVIDENCE.has(s.evidence_state)) throw Error('crm_signal_evidence_state_invalid');
    if(!['open','held','resolved'].includes(s.state)) throw Error('crm_signal_state_invalid');
    if(!['critical','high','normal'].includes(s.severity)) throw Error('crm_signal_severity_invalid');
    if(time(s.observed_at,'signal_observed_at') > nowMs+120000) throw Error('crm_signal_future_observation');
    evidence[s.evidence_state]++;
    const d=domains[s.domain]||(domains[s.domain]={total:0,open:0,held:0,due:0}); d.total++;
    if(s.state!=='resolved') {
      d.open++; d.held++; open++; held++; attention[s.severity]++;
      if(s.due_at && time(s.due_at,'due_at')<=nowMs) { due++; d.due++; }
    }
  }
  const counts={scanned:input.signals.length+input.connectors.length+gaps,changed:held+gaps,admitted:0,held:held+gaps};
  const body={
    schema:'evercraft.crm.heartbeat-report.v1', observed_at:now.toISOString(),
    state:gaps?'degraded':'read_only', sources:health,
    coverage:{source_count:input.connectors.length,unique_signals:input.signals.length,due,open},
    attention, domains:Object.fromEntries(Object.entries(domains).sort(([a],[b])=>a.localeCompare(b))),
    evidence,action_authority:'none',contact_permission_granted:false,
    payment_verified_by_this_scan:false,raw_personal_data_included:false,
    source_revision_fingerprint:'sha256:'+hash(input.source_revision)
  };
  const report={...body,receipt_hash:'sha256:'+hash(body)};
  const snapshot={
    schema:'evercraft.kaidance.mission-snapshot.v1',observed_at:now.toISOString(),
    snapshot_ref:report.receipt_hash,counts,
    evidence_refs:['crm:heartbeat:'+report.receipt_hash,'crm:status:'+report.state]
  };
  return {report,snapshot};
}
function hold(reason,now) {
  const body={schema:'evercraft.crm.heartbeat-report.v1',observed_at:now.toISOString(),state:'held',reason,
    action_authority:'none',raw_personal_data_included:false,source_revision_fingerprint:null};
  const report={...body,receipt_hash:'sha256:'+hash(body)};
  return {report,snapshot:{schema:'evercraft.kaidance.mission-snapshot.v1',
    observed_at:now.toISOString(),snapshot_ref:report.receipt_hash,
    counts:{scanned:1,changed:1,admitted:0,held:1},evidence_refs:['crm:hold:'+reason]}};
}
function write(file,obj) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
}
export function writeCrmHeartbeatArtifacts({inputPath=process.env.EVERCRAFT_CRM_HEARTBEAT_INPUT||'',
  inputData=null,holdReason='',outDir=path.join(process.cwd(),'artifacts/crm-heartbeat'),
  now=new Date()}={}) {
  let value;
  if(holdReason) {
    const allowed=new Set(['source_not_configured','source_missing','source_invalid','source_permissions_or_type_invalid','source_stale']);
    value=hold(allowed.has(holdReason)?holdReason:'source_invalid',now);
  } else if(inputData) {
    try {value=buildCrmHeartbeat(inputData,{now});}
    catch {value=hold('source_invalid',now);}
  } else if(!inputPath) value=hold('source_not_configured',now);
  else try {
    const stat=fs.lstatSync(inputPath);
    if(!stat.isFile()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0)) throw Error('unsafe_file');
    const fd=fs.openSync(inputPath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    let data;
    try {
      const opened=fs.fstatSync(fd);
      if(!opened.isFile()||(process.platform!=='win32'&&(opened.mode&0o077)!==0)) throw Error('unsafe_file');
      if(opened.size>5*1024*1024) throw Error('oversize');
      // Read the file descriptor we just verified, not a potentially swapped path.
      data=JSON.parse(fs.readFileSync(fd,'utf8'));
    } finally {
      fs.closeSync(fd);
    }
    // Read a fresh private adapter projection on every cycle. Never upload input.
    value=buildCrmHeartbeat(data,{now});
  } catch(error) {
    const m=error?.message||'';
    const reason=error?.code==='ENOENT'?'source_missing'
      :m==='unsafe_file'?'source_permissions_or_type_invalid'
      :m==='oversize'?'source_too_large'
      :m==='crm_source_stale_or_future'?'source_stale':'source_invalid';
    value=hold(reason,now);
  }
  write(path.join(outDir,'latest.json'),value.report);
  write(path.join(outDir,'mission-snapshot.json'),value.snapshot);
  return value;
}
