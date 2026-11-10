import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { reconcileSignedAgentRoster, HISTORICAL_ROLE_NAME_LEADS } from "../systemia/agent-continuity/reconcile-owned-roster.mjs";

const pair=crypto.generateKeyPairSync("ed25519");
const other=crypto.generateKeyPairSync("ed25519");
const trust={registry_snapshot:{"owned-registry":pair.publicKey.export({type:"spki",format:"pem"})}};
const now=new Date("2026-10-29T06:00:00Z");
function snapshot(){
  return {
    schema:"evercraft.agent-continuity.registry-snapshot.v1",
    source:{
      system:"evercraft-owned-raven-nexus",
      source_receipt_ref:"owner-signed-source-receipt-1",
      observed_at:"2026-10-29T05:59:00Z",
    },
    role_profiles:[
      ...HISTORICAL_ROLE_NAME_LEADS.map((name,i)=>({id:"current-real-id-"+i,name,status:"active"})),
      ...["Unidentified A","Unidentified B","Unidentified C"].map((name,i)=>({id:"current-missing-id-"+i,name,status:"active"})),
    ],
    dna_protocols:[
      {id:"juniper",name:"Juniper",kind:"embedded",counts_as_agent:false,status:"active"},
      {id:"sentinel",name:"Sentinel",kind:"embedded",counts_as_agent:false,status:"active"},
    ],
    lineups:[{id:"starting-five",role_ids:["current-real-id-0","current-real-id-1"],status:"active"}],
  };
}
function signed(p=snapshot(),privateKey=pair.privateKey){
  const envelope={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind:"registry_snapshot",key_id:"owned-registry",
    issued_at:"2026-10-29T05:59:00Z",
    expires_at:"2026-10-29T06:04:00Z",
    payload:p,
  };
  return {...envelope,signature:crypto.sign(null,signedAgentEvidenceMessage(envelope),privateKey).toString("base64")};
}
const audit=(envelope)=>reconcileSignedAgentRoster({rosterEnvelope:envelope,trustedKeys:trust,now});

test("signed 22-role census matches only 19 name leads without manufacturing three missing historical identities",()=>{
  const r=audit(signed());
  assert.equal(HISTORICAL_ROLE_NAME_LEADS.length,19);
  assert.equal(r.signature_authenticated,true);
  assert.equal(r.current_registered_active_roles,22);
  assert.equal(r.candidate_name_matches.length,19);
  assert.equal(r.active_roles_not_in_historical_name_leads.length,3);
  assert.equal(r.current_registered_lineups,1);
  assert.equal(r.state,"held_historical_identity_baseline_missing");
  assert.equal(r.historical_immutable_id_baseline_verified,false);
  assert.match(r.explanation_of_21_vs_22,/unresolved/);
  assert.equal(r.operational_agents_verified,0);
  assert.equal(r.all_roles_live,false);
});
test("signed roster does not claim live agent even if all archival name leads match",()=>{
  const p=snapshot();p.role_profiles=p.role_profiles.slice(0,19);
  const r=audit(signed(p));
  assert.equal(r.candidate_name_matches.length,19);
  assert.equal(r.active_roles_not_in_historical_name_leads.length,0);
  assert.equal(r.state,"held_historical_identity_baseline_missing");
  assert.equal(r.all_roles_live,false);
});
test("forged and mutated snapshots never expose current role memberships as authenticated",()=>{
  for(const env of [
    signed(snapshot(),other.privateKey),
    (()=>{const x=signed();x.payload.role_profiles[0].name="FAKE";return x;})(),
  ]){
    const r=audit(env);
    assert.equal(r.state,"held_unverified");
    assert.equal(r.signature_authenticated,false);
    assert.equal(r.operational_agents_verified,0);
    assert.equal(Object.hasOwn(r,"candidate_name_matches"),false);
  }
});
test("fresh signature with stale observation cannot certify or expose candidate matches",()=>{
  const p=snapshot();p.source.observed_at="2026-10-28T05:59:00Z";
  const r=audit(signed(p));
  assert.equal(r.state,"held_unverified");
  assert.ok(r.holds.includes("commissioned_registry_observation_stale"));
});
test("duplicate role names, duplicated IDs, malformed DNA or fake formations cannot reconcile",()=>{
  for(const mutate of [
    (p)=>{p.role_profiles[1].name=p.role_profiles[0].name;},
    (p)=>{p.role_profiles[1].id=p.role_profiles[0].id;},
    (p)=>{p.dna_protocols[0].counts_as_agent=true;},
    (p)=>{p.lineups[0].role_ids.push("phantom-agent");},
    (p)=>{p.role_profiles[0].name="Sentinel";},
  ]){
    const p=snapshot();mutate(p);
    const r=audit(signed(p));
    assert.equal(r.state,"held_unverified");
    assert.equal(r.operational_agents_verified,0);
    assert.equal(Object.hasOwn(r,"candidate_name_matches"),false);
  }
});
test("missing historical names are reported, without silently renaming or adding identities",()=>{
  const p=snapshot();p.role_profiles[5].status="inactive";
  const r=audit(signed(p));
  assert.equal(r.named_leads_not_in_active_snapshot.length,1);
  assert.equal(r.current_registered_active_roles,21);
  assert.equal(r.state,"held_historical_identity_baseline_missing");
  assert.equal(r.operational_agents_verified,0);
});

test("private August 21-name lead file plus October 19-name audit yields 22 candidate names, not 22 proven historic identities",()=>{
  const p=snapshot();
  p.role_profiles=p.role_profiles.map((x)=>({...x}));
  const additional=["Atlas","Solstice","Melody"];
  for(let i=0;i<3;i++)p.role_profiles[19+i].name=additional[i];
  const august=HISTORICAL_ROLE_NAME_LEADS.filter((name)=>name!=="Saban").concat(additional);
  assert.equal(august.length,21);
  const archive={
    schema:"evercraft.agent-continuity.historical-name-leads.v1",
    source:{google_drive_file_id:"private-owner-archive"},
    august_role_names:august,
    historical_role_id_baseline_verified:false,
  };
  const r=reconcileSignedAgentRoster({
    rosterEnvelope:signed(p),trustedKeys:trust,now,
    historicalArchive:archive,
  });
  assert.equal(r.state,"held_historical_identity_baseline_missing");
  assert.equal(r.august_2026_named_role_count,21);
  assert.equal(r.cross_period_distinct_name_count,22);
  assert.equal(r.cross_period_name_matches_to_current_signed_registry.length,22);
  assert.deepEqual(r.august_only_vs_october_names.sort(),additional.map((x)=>x.toLowerCase()).sort());
  assert.deepEqual(r.october_only_vs_august_names,["saban"]);
  assert.equal(r.cross_period_name_census_is_id_proof,false);
  assert.equal(r.historical_immutable_id_baseline_verified,false);
  assert.equal(r.all_roles_live,false);
  assert.equal(r.operational_agents_verified,0);
});
test("malformed or overclaiming private archival names fail closed even against signed current roster",()=>{
  const good={
    schema:"evercraft.agent-continuity.historical-name-leads.v1",
    source:{google_drive_file_id:"private-owner-archive"},
    august_role_names:["Systemia","Raven"],
    historical_role_id_baseline_verified:false,
  };
  for(const historicalArchive of [
    {...good,august_role_names:["Raven","Raven"]},
    {...good,historical_role_id_baseline_verified:true},
    {...good,source:{}},
    {...good,schema:"evercraft.agent-continuity.registry-snapshot.v1"},
  ]){
    const r=reconcileSignedAgentRoster({
      rosterEnvelope:signed(snapshot()),trustedKeys:trust,now,historicalArchive,
    });
    assert.equal(r.state,"held_unverified");
    assert.ok(r.holds.includes("historical_archive_name_leads_invalid_or_overclaimed"));
    assert.equal(r.operational_agents_verified,0);
  }
});
