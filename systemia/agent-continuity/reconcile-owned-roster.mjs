#!/usr/bin/env node
/**
 * Read-only reconciliation of an authenticated, current Raven Nexus roster
 * against *name-only* historical leads. It is intentionally incapable of
 * deciding that historical "21 superagents" equals 22 role profiles.
 * Nothing in this module creates, modifies or deploys a specialist.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { verifySignedAgentEvidence } from "./signed-evidence.mjs";
import { signedRosterDigest } from "./signed-roster.mjs";

// Names only, transcribed from Oct 16/17 historical user-owned audit.
// This is NOT an authenticated historical ID baseline.
export const HISTORICAL_ROLE_NAME_LEADS = Object.freeze([
  "Systemia","Raven","Lattice","Mnemosyne","Scribe",
  "Talon","Sable","Prometheus","Tempo",
  "Forge","Vesper","Archimedes","Aster",
  "Saban","Meridian","Oracle","Sage","MAPLE","Haley",
]);

const norm=(v)=>String(v??"").trim().toLowerCase();
const arr=(v)=>Array.isArray(v)?v:[];

export function reconcileSignedAgentRoster({
  rosterEnvelope,
  trustedKeys,
  now=new Date(),
  historicNames=HISTORICAL_ROLE_NAME_LEADS,
  historicalArchive=null,
  maxObservationAgeMs=15*60_000,
}={}){
  const holds=[];
  const add=(reason)=>{if(!holds.includes(reason))holds.push(reason);};
  if(!verifySignedAgentEvidence({
    envelope:rosterEnvelope,kind:"registry_snapshot",trustedKeys,now,
  })){
    return {
      schema:"evercraft.agent-continuity.roster-reconciliation.v1",
      state:"held_unverified",
      signature_authenticated:false,
      operational_agents_verified:0,
      all_roles_live:false,
      holds:["commissioned_registry_signature_invalid"],
    };
  }
  const p=rosterEnvelope.payload;
  const stamp=Date.parse(p?.source?.observed_at||"");
  const clock=now instanceof Date?now.getTime():Date.parse(now);
  if(p?.schema!=="evercraft.agent-continuity.registry-snapshot.v1"||
      p?.source?.system!=="evercraft-owned-raven-nexus"||
      !String(p?.source?.source_receipt_ref||"").trim()) add("commissioned_registry_origin_or_schema_invalid");
  if(!Number.isFinite(stamp)||!Number.isFinite(clock)||stamp>clock||
     clock-stamp>maxObservationAgeMs) add("commissioned_registry_observation_stale");
  const profiles=arr(p?.role_profiles);
  const allIds=profiles.map((x)=>norm(x?.id));
  const allNames=profiles.map((x)=>norm(x?.name));
  if(!profiles.length||allIds.some((x)=>!x)||new Set(allIds).size!==allIds.length)
    add("commissioned_registry_role_identity_invalid");
  if(allNames.some((x)=>!x)||new Set(allNames).size!==allNames.length)
    add("commissioned_registry_role_name_ambiguous");
  if(profiles.some((x)=>["juniper","sentinel"].includes(norm(x?.name))||
      ["juniper","sentinel"].includes(norm(x?.id))))
    add("commissioned_dna_counted_as_agent");
  for(const name of ["juniper","sentinel"]){
    const found=arr(p?.dna_protocols).filter((x)=>norm(x?.name||x?.id)===name);
    if(found.length!==1||found[0].counts_as_agent!==false||
       norm(found[0].status)!=="active"||norm(found[0].kind)!=="embedded")
      add("commissioned_"+name+"_protocol_invalid");
  }
  const lineups=arr(p?.lineups);
  const lineupIds=lineups.map((x)=>norm(x?.id));
  if(lineupIds.some((x)=>!x)||new Set(lineupIds).size!==lineupIds.length||
     lineups.some((x)=>!Array.isArray(x?.role_ids)||
       x.role_ids.some((id)=>!allIds.includes(norm(id)))))
    add("commissioned_registry_lineup_reference_invalid");
  const active=profiles.filter((p)=>norm(p.status)==="active");
  const leads=arr(historicNames).map(norm);
  if(!leads.length||leads.some((x)=>!x)||new Set(leads).size!==leads.length)
    add("historical_name_leads_invalid");
  // Optional *private* owner-supplied archive is historical, unsigned and
  // name-only. It is never a registry, immutable-ID baseline or execution
  // authorization, regardless of the values it claims in other fields.
  const august=historicalArchive===null?null:arr(historicalArchive.august_role_names).map(norm);
  if(historicalArchive!==null && (
      historicalArchive?.schema!=="evercraft.agent-continuity.historical-name-leads.v1"||
      !august.length||august.some((x)=>!x)||
      new Set(august).size!==august.length||
      !String(historicalArchive?.source?.google_drive_file_id||"").trim()||
      historicalArchive?.historical_role_id_baseline_verified!==false)) {
    add("historical_archive_name_leads_invalid_or_overclaimed");
  }
  if(holds.length){
    return {
      schema:"evercraft.agent-continuity.roster-reconciliation.v1",
      state:"held_unverified",signature_authenticated:true,
      operational_agents_verified:0,all_roles_live:false,
      holds,
    };
  }
  const byName=new Map(active.map((x)=>[norm(x.name),x]));
  const matches=leads.filter((n)=>byName.has(n)).map((n)=>({
    name:byName.get(n).name,
    current_role_id:byName.get(n).id,
    status:"active_in_signed_registry",
    historical_immutable_id_verified:false,
  }));
  const absent=historicNames.filter((name)=>!byName.has(norm(name)));
  const leadSet=new Set(leads);
  const unmatched=active.filter((x)=>!leadSet.has(norm(x.name)))
    .map((x)=>({name:x.name,current_role_id:x.id,status:"not_in_historical_name_leads"}));
  const crossPeriod=august ? [...new Set([...leads,...august])] : null;
  const augustOnly=august?.filter((n)=>!leadSet.has(n)) || null;
  const octoberOnly=august?leads.filter((n)=>!august.includes(n)):null;
  // Match names against *signed current* identities, but never confuse a
  // matching string with the historic immutable ID of an original agent.
  const crossPeriodMatches=crossPeriod?.filter((n)=>byName.has(n)).map((n)=>({
    name:byName.get(n).name,
    current_role_id:byName.get(n).id,
    historical_immutable_id_verified:false,
  })) || null;
  return {
    schema:"evercraft.agent-continuity.roster-reconciliation.v1",
    state:"held_historical_identity_baseline_missing",
    signature_authenticated:true,
    current_roster_digest:signedRosterDigest(rosterEnvelope),
    source_receipt_ref:p.source.source_receipt_ref,
    source_observed_at:p.source.observed_at,
    historic_roster_role_count_observed_2026_10_16:22,
    founder_reported_superagent_count:21,
    current_registered_active_roles:active.length,
    current_registered_lineups:lineups.filter((x)=>norm(x.status)==="active").length,
    named_historical_leads:historicNames.length,
    candidate_name_matches:matches,
    named_leads_not_in_active_snapshot:absent,
    active_roles_not_in_historical_name_leads:unmatched,
    august_2026_named_role_count:august?.length??null,
    august_name_leads_missing_from_active_snapshot:august?.filter((n)=>!byName.has(n))??null,
    cross_period_distinct_name_count:crossPeriod?.length??null,
    cross_period_name_matches_to_current_signed_registry:crossPeriodMatches,
    august_only_vs_october_names:augustOnly,
    october_only_vs_august_names:octoberOnly,
    cross_period_name_census_is_id_proof:false,
    historical_immutable_id_baseline_verified:false,
    explanation_of_21_vs_22:"unresolved; no coordinator/subtraction assumptions permitted",
    operational_agents_verified:0,
    all_roles_live:false,
    execution_authority_granted:false,
    holds:["historical_immutable_id_baseline_missing","commissioned_worker_execution_not_established"],
  };
}
function privateFile(file,label){
  if(!file||typeof file!=="string"||!file.trim())throw Error(label+"_missing");
  const resolved=path.resolve(file);
  const stat=fs.lstatSync(resolved);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error(label+"_not_regular_file");
  if((stat.mode&0o077)!==0)throw Error(label+"_permissions_too_open");
  if(typeof process.getuid==="function"&&stat.uid!==process.getuid())throw Error(label+"_owner_mismatch");
  return resolved;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  const flag=(name)=>args.includes(name)?args[args.indexOf(name)+1]:"";
  try {
    const evidence=JSON.parse(fs.readFileSync(privateFile(flag("--signed-roster"),"signed_roster"),"utf8"));
    const keys=JSON.parse(fs.readFileSync(privateFile(flag("--trust-keys"),"trust_keys"),"utf8"));
    const archiveFile=flag("--historical-leads");
    const historicalArchive=archiveFile
      ? JSON.parse(fs.readFileSync(privateFile(archiveFile,"historical_leads"),"utf8"))
      : null;
    const result=reconcileSignedAgentRoster({
      rosterEnvelope:evidence,trustedKeys:keys,historicalArchive,
    });
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    // Reconciliation is held until authenticated immutable historic IDs exist.
    process.exitCode=2;
  } catch(e){
    process.stderr.write(JSON.stringify({
      state:"held_unverified",reason:e instanceof Error?e.message:String(e),
      execution_authority_granted:false,
    })+"\n");
    process.exitCode=2;
  }
}
