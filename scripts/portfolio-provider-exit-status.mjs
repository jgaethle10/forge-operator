#!/usr/bin/env node
// Portfolio-wide source/dependency exit ledger. A code tree cannot prove that
// customer records, external accounts, revenue, DNS, jobs or app runtimes are migrated.
import fs from 'node:fs';
import path from 'node:path';
import {validateActiveInstallDoors,inventoryRegistryDebt} from './audit-owned-mcp-exit.mjs';
const root=process.cwd();
const estate=JSON.parse(fs.readFileSync(path.join(root,'systemia/migrations/base44-exit/estate-snapshot.json'),'utf8'));
const commercial=JSON.parse(fs.readFileSync(path.join(root,'public/.well-known/evercraft-commercial-readiness.json'),'utf8'));
const install=validateActiveInstallDoors({root});
const registry=inventoryRegistryDebt({root});
const knownOwnedSource=[
 ['EverMaps','public/evermaps/index.html'],
 ['Evercraft Property Services','public/eps/index.html'],
 ['Havenly Cleaning Command Center','public/havenly/index.html'],
 ['EPS Precise Estimator','public/apps/eps-estimator/index.html']
];
const queued=(estate.queue||[]).map(item=>({
 product:item.product,
 wave:item.wave,
 prior_inventory_state:item.state,
 migration_stage:'INCOMPLETE_UNLESS_INDEPENDENT_DEPLOYMENT_DATA_AUTH_AND_ROLLBACK_RECEIPTS',
 target:item.target,
 code_presence:knownOwnedSource.find(x=>x[0]===item.product)
  ? (fs.existsSync(path.join(root,knownOwnedSource.find(x=>x[0]===item.product)[1]))?'owned_frontend_source_exists':'owned_frontend_source_not_yet_in_this_revision')
  :'not_scoped_by_this_source-only_inventory',
 public_owned_route_verified:false,
 private_record_reconciliation_verified:false,
 payment_verified:false,
 legacy_shutdown_authorized:false
}));
const risk=[
 {
  id:'CONTROL_PLANE',
  priority:'P0',scope:'Systemia Command Center, Remote Ops, InternalOps, heartbeat and execution continuity',
  release_gate:'owned scheduler and authority receipts; private state/credentials imported with reconciliation; external resident execution and rollback'
 },
 {
  id:'BUYER_PAYMENT',
  priority:'P0',scope:'FindMyPart, Evercraft Payments, revenue machine discovery and checkout',
  release_gate:'owned HTTPS buyer route, price/consent, authenticated provider-paid readback, order ledger, refunds and fulfillment'
 },
 {
  id:'SPECIALIST_MACHINE_CONNECTORS',
  priority:'P0',scope:'MCP registry entries and provider-specific installer packages',
  release_gate:'exact tool parity, owned remote TLS endpoint, registry/provider repoint and independently observed installation'
 },
 {
  id:'CUSTOMER_SERVICES',
  priority:'P0',scope:'EPS, Havenly, Sunshine & Spotless, quote and lead operations',
  release_gate:'customer-facing route plus lawful private submissions, inbox persistence, rollback and owned DNS control'
 },
 {
  id:'SAFETY_AND_MEDIA',
  priority:'P1',scope:'Guardian, EverNest, Raven Nexus, ForensiScope and personal files',
  release_gate:'identity, privacy, consent, encrypted data, safe retention, transfer continuity and recipient verification'
 },
 {
  id:'WORLD_EXPLORATION',
  priority:'P1',scope:'EverMaps, EarthWorks, World Engine, hike/drive/fly/VR',
  release_gate:'owned staging, actual desktop/phone/Quest rendering and source truth, domain routing and rollback'
 }
];
const blockers=[];
if(estate.observed_apps_minimum>queued.length)
 blockers.push('Estate inventory capped at 100 applications; only '+queued.length+' named workstreams in migration queue. Unknown apps not silently declared retired.');
if(install.state!=='OWNED_INSTALL_DOORS_PASS')blockers.push('Owned machine-connector install gate failed');
if(registry.legacy_manifest_count>0)blockers.push(registry.legacy_manifest_count+' product-specific MCP registry source manifests still reference legacy provider endpoints');
if(commercial.commercial_checkout_ready!==true)
 blockers.push('Evercraft Payments checkout not verified; never route customers to historical hosted buyer forms');
blockers.push('Source-level inventory does not prove live public DNS, private entity reconciliation, app runtime shutdown or provider-side listing changes');
const report={
 schema:'evercraft.systemia.portfolio-provider-exit-state.v1',
 generated_at_utc:new Date().toISOString(),
 source:'GitHub canonical source and dated prior estate snapshot only; no live account read or external domain probe',
 observed_legacy_apps_minimum:estate.observed_apps_minimum,
 legacy_inventory_observed_at:estate.observed_at,
 named_migration_workstreams:queued.length,
 owned_ai_install_state:install.state,
 product_specific_registry_manifests:registry.manifest_count,
 legacy_product_specific_registry_manifests:registry.legacy_manifest_count,
 public_commercial_checkout_ready:commercial.commercial_checkout_ready===true,
 migration_complete:false,
 deployment_and_shutdown_verified:false,
 migration_queue:queued,
 action_priorities:risk,
 blockers,
 safety:{
   historical_urls_are_not_working_link_evidence:true,
   no_automatic_legacy_decommission:true,
   customer_data_exported_by_this_audit:false,
   no_paid_activity:true,
   no_production_domain_changed:true
 }
};
const outFlag=process.argv.indexOf('--out');
if(outFlag>=0){
 const file=process.argv[outFlag+1];
 if(!file)throw new Error('output_path_required');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({schema:report.schema,observed_legacy_apps_minimum:report.observed_legacy_apps_minimum,
 named_migration_workstreams:report.named_migration_workstreams,
 owned_ai_install_state:report.owned_ai_install_state,
 legacy_specialist_mcp_manifests:report.legacy_product_specific_registry_manifests,
 commercial_checkout_ready:report.public_commercial_checkout_ready,
 migration_complete:false,
 blocking_items:report.blockers},null,2));
if(install.state!=='OWNED_INSTALL_DOORS_PASS')process.exitCode=1;
