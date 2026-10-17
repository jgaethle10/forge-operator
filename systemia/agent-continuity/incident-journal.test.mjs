import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {appendJournalEvent,readJournalEvent,readJournalIncident,localIncidentProjections} from './incident-journal.mjs';
import {SCHEMA} from './incident-event.mjs';

const kp=generateKeyPairSync('ed25519');
const mission_id='evercraft-agent-continuity-fabric-20261016';
const trust={'owned-source':{public_key_pem:kp.publicKey.export({format:'pem',type:'spki'}),tenant_id:'evercraft',source_id:'owned-scheduler-audit',actor_ids:['leased-spider'],permission_scopes:['audit:read']}};
const policy={tenant_id:'evercraft',mission_id,now:Date.parse('2026-10-17T08:00:20Z')};
const base={tenant_id:'evercraft',mission_id,incident_id:'spider-crash-001',trust,policy};
const root=()=>mkdtempSync(join(tmpdir(),'blackbox-local-journal-'));
function payload(event_id='evt-1',event_type='worker_exit') {return {schema:SCHEMA,tenant_id:'evercraft',mission_id,incident_id:'spider-crash-001',event_id,source_id:'owned-scheduler-audit',agent_id:'spider',workload_id:'leased-spider',operation_id:'ticket-01',occurred_at:'2026-10-17T08:00:00Z',observed_at:'2026-10-17T08:00:01Z',clock_uncertainty_ms:1000,event_type,evidence_kind:'source_observation',actor_id:'leased-spider',permission_scope:'audit:read',idempotency_key:'ticket-01',upstream_event_ids:[],persistence_paths:[{type:'retry',resource_id:'retry-maybe',state:'unknown'}],possible_impact:['ticket-creation'],verified_impact:[],external_effect:'UNKNOWN'};}
function signed(p=payload()) {const purpose='evercraft.blackbox.readonly-ingest.v1';return {purpose,key_id:'owned-source',payload:p,signature:sign(null,Buffer.from(purpose+'\n'+JSON.stringify(p)),kp.privateKey).toString('base64')};}
function withRoot(fn){const journal_root=root(); try{return fn(journal_root);}finally{rmSync(journal_root,{recursive:true,force:true});}}

test('authenticated local append survives fresh read and retains UNKNOWN external outcome',()=>withRoot(journal_root=>{
 const envelope=signed(); const appended=appendJournalEvent({...base,journal_root,envelope});
 assert.match(appended.local_custody_state,/NOT_REMOTE_OR_INDEPENDENT/);
 const reopened=readJournalEvent({...base,journal_root,event_id:'evt-1'});
 assert.equal(reopened.receipt.event_sha256,appended.receipt.event_sha256);
 assert.equal(reopened.receipt.external_effect_provider_verified,false);
 assert.equal(reopened.envelope.payload.external_effect,'UNKNOWN');
 assert.equal(reopened.receipt.execution_authority,'NONE_READ_ONLY');
}));
test('replay and conflicting re-use of event id held after durable write',()=>withRoot(journal_root=>{
 const original=signed();appendJournalEvent({...base,journal_root,envelope:original});
 assert.throws(()=>appendJournalEvent({...base,journal_root,envelope:original}),/replay or conflicting/);
 const conflicting=payload();conflicting.possible_impact=['different-effect'];
 assert.throws(()=>appendJournalEvent({...base,journal_root,envelope:signed(conflicting)}),/replay or conflicting/);
 assert.equal(readJournalIncident({...base,journal_root}).length,1);
}));
test('tenant and mission boundaries prevent reading another incident',()=>withRoot(journal_root=>{
 appendJournalEvent({...base,journal_root,envelope:signed()});
 assert.throws(()=>readJournalIncident({...base,journal_root,tenant_id:'tenant-other'}),/custody directory/);
 assert.throws(()=>readJournalIncident({...base,journal_root,mission_id:'other-mission'}),/custody directory/);
 assert.throws(()=>readJournalEvent({...base,journal_root,incident_id:'incident-other',event_id:'evt-1'}),/custody directory/);
}));
test('no untrusted payload reaches the filesystem',()=>withRoot(journal_root=>{
 const e=signed(); e.signature=e.signature.replace(/^./,e.signature[0]==='A'?'B':'A');
 assert.throws(()=>appendJournalEvent({...base,journal_root,envelope:e}),/signature/);
 assert.throws(()=>readJournalIncident({...base,journal_root}),/custody directory/);
}));
test('tampered on-disk evidence fails closed',()=>withRoot(journal_root=>{
 const entry=appendJournalEvent({...base,journal_root,envelope:signed()});
 writeFileSync(entry.path,'{"forged":true}');
 assert.throws(()=>readJournalEvent({...base,journal_root,event_id:'evt-1'}),/stored record invalid/);
 assert.throws(()=>localIncidentProjections({...base,journal_root}),/stored record invalid/);
}));
test('local read-only projections share incident identity and unknown persistence for CHUM and Spider',()=>withRoot(journal_root=>{
 appendJournalEvent({...base,journal_root,envelope:signed(payload('evt-1','tool_attempt'))});
 const second=payload('evt-2','retry_scheduled');second.upstream_event_ids=['evt-1'];second.persistence_paths=[{type:'retry',resource_id:'retry-maybe',state:'reported'}];
 appendJournalEvent({...base,journal_root,envelope:signed(second)});
 const view=localIncidentProjections({...base,journal_root});
 assert.equal(view.incident_id,'spider-crash-001');
 assert.deepEqual(view.black_box.verified_impact,[]);
 assert.equal(view.black_box.external_provider_verification,'NOT_PERFORMED');
 assert.equal(view.chum.incident_trail_candidates.length,2);
 assert.equal(view.chum.real_chum_invocation,false);
 assert.equal(view.spider_society.persistence_candidates.length,2);
 assert.equal(view.spider_society.no_regeneration_proven,false);
 assert.equal(view.execution_authority,'NONE_READ_ONLY');
 assert.deepEqual(view.black_box.timeline[1].upstream_event_ids,['evt-1']);
}));
test('open custody folder is rejected rather than treated as private',()=>withRoot(journal_root=>{
 if(process.platform==='win32')return;
 chmodSync(journal_root,0o755);
 assert.throws(()=>appendJournalEvent({...base,journal_root,envelope:signed()}),/permissions not private/);
}));
