// Evercraft one-body coordination: verified Courier metadata to company-wide
// planning. No media reads, external requests, worker spawn, public release,
// checkout or payment. Called only after the receiver's own integrity check
// and successful Passport-gated inert Intake offer.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {admitMultiplicationRequest} from '../saban/admission.mjs';

export const ONE_COMPANY_COURIER_SCHEMA='evercraft.systemia.one-company-courier-plan.v1';
const MODULE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const HEX64=/^[a-f0-9]{64}$/i;
const HEX32=/^[a-f0-9]{32}$/i;
const MEDIA_AV=/\.(?:mp4|mov|mkv|webm|m4v|avi|mp3|wav|m4a|aac|flac|ogg)$/i;
const fail=s=>{throw Error('one_company_courier_'+s)};

function readCatalog(root,relative,expectedSchema){
 const payload=JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
 if(payload?.schema!==expectedSchema)fail('catalog_schema_mismatch');
 return payload;
}
function capacityProposal(contract,{workItems=1,logical=6,physical=2}={}){
 if(!contract)return {state:'UNREGISTERED',sourceContractPresent:false};
 const result=admitMultiplicationRequest({
  contract,requestedLogicalAgents:logical,
  requestedPhysicalWorkers:physical,requestedWorkItems:workItems,
  requestedAttempts:1,
  budget:{max_logical_agents:8,max_physical_workers:2,max_work_items:100,
   max_attempts_per_job:1}
 });
 return {
  state:result.admitted?'BOUNDED_FORMATION_PROPOSAL':'CONTRACT_REJECTED',
  sourceContractPresent:true,
  softwareId:contract.software_id,
  adapterSource:contract.adapter,
  logicalAgentCeiling:result.admitted?result.grant.logical_agents:null,
  physicalWorkerCeiling:result.admitted?result.grant.physical_workers:null,
  plannedWorkItems:workItems,
  // The Saban admission helper is a pure calculation. This does not
  // allocate a worker, generate a lease or authorize execution.
  workerLeaseGranted:false,formationStarted:false,
  executionAuthority:false,
  reason:result.reason
 };
}
function row(id,state,more={}){
 return {department:id,state,...more,executionAuthorized:false,
  customerContactAuthorized:false,paymentAuthorized:false};
}

/**
 * Inventory is sourced directly from the canonical product/capability/Saban
 * registries, never from an invented routing map. Source registration does
 * NOT establish a deployed runtime or permission to process private content.
 */
export function oneCompanyCapabilityInventory(rootDir=MODULE_ROOT){
 const catalog=readCatalog(rootDir,'registry/public-products.json',
  'evercraft.saban.public-product-index.v1');
 const saban=readCatalog(rootDir,'systemia/saban/multiplication-registry.json',
  'evercraft.saban.multiplication-registry.v1');
 const mesh=readCatalog(rootDir,'systemia/capability-mesh/contracts.json',
  'evercraft.capability-mesh.contracts.v1');
 const productKeys=(catalog.products||[]).map(x=>x.product_key);
 const softwareIds=(saban.software||[]).map(x=>x.software_id);
 const meshKeys=(mesh.contracts||[]).map(x=>x.product_key);
 if([productKeys,softwareIds,meshKeys].some(a=>a.some(x=>typeof x!=='string'||!x))
   ||new Set(productKeys).size!==productKeys.length
   ||new Set(softwareIds).size!==softwareIds.length
   ||new Set(meshKeys).size!==meshKeys.length)fail('ambiguous_catalog_identity');
 return {schema:'evercraft.systemia.one-company-coverage.v1',
  publicProductKeys:productKeys,registeredSabanSoftware:softwareIds,
  declaredSharedRuntimeContracts:meshKeys,
  // This is a list of SOURCE registrations, not operational connections.
  allLiveConnected:false,sourceInventoryOnly:true};
}

/**
 * This proposal must only be called by a privileged private receiver *after*
 * it has rehashed the exact files on disk and offered inert metadata to
 * Systemia Intake with a genuine Passport grant. This projection alone cannot
 * authenticate a caller-supplied receipt; every returned route stays HELD.
 */
export function projectOneCompanyCourierHandoff({receipt,intake,rootDir=MODULE_ROOT}={}){
 if(receipt?.schema!=='evercraft.systemia.wing-receive-receipt.v1'||
    receipt.state!=='AUTHENTICATED_BYTES_RECEIVED'||
    receipt.privateCustodyVerified!==true||
    !HEX32.test(receipt.id||'')||
    receipt.toWing!=='fallen'||receipt.fromWing!=='harbor')
    fail('expected_receiver_custody_required');
 // Verify the metadata contract again without trusting caller-provided
 // custody status as independent evidence. Only the resident's local verified
 // bytes + Passport path may produce an authentic live plan.
 if(!Array.isArray(receipt.assets)||receipt.assets.length<1||
    receipt.assets.length>100||!HEX64.test(receipt.ciphertextSha256||''))
    fail('asset_manifest_invalid');
 const names=new Set();
 for(const asset of receipt.assets){
  const name=asset?.filename;
  if(typeof name!=='string'||name.length>200||!name||
     name!==path.basename(name)||name.startsWith('.')||
     name.includes('\\\\')||names.has(name.toLowerCase())||
     !HEX64.test(asset.sha256||'')||
     !Number.isSafeInteger(asset.bytes)||asset.bytes<1)
     fail('asset_manifest_invalid');
  names.add(name.toLowerCase());
 }
 if(intake?.schema!=='evercraft.wing-courier.intake-handoff.v1'||
    intake.packageId!==receipt.id||
    !['candidate_only','duplicate'].includes(intake.intakeState)||
    !intake.candidateId||!HEX64.test(intake.intakeReceiptHash||'')||
    intake.admissionGranted!==false||intake.executionGranted!==false||
    intake.customerDeliveryGranted!==false)
    fail('passport_intake_candidate_required');

 const inventory=oneCompanyCapabilityInventory(rootDir);
 const saban=readCatalog(rootDir,'systemia/saban/multiplication-registry.json',
  'evercraft.saban.multiplication-registry.v1');
 const mesh=readCatalog(rootDir,'systemia/capability-mesh/contracts.json',
  'evercraft.capability-mesh.contracts.v1');
 const software=new Map(saban.software.map(x=>[x.software_id,x]));
 const products=new Map(mesh.contracts.map(x=>[x.product_key,x]));
 const forensi=products.get('forensiscope');
 const clip=products.get('evercraft-clip');
 const media=receipt.kind==='media';
 const avCount=media?receipt.assets.filter(a=>MEDIA_AV.test(a.filename)).length:0;
 const fContract=forensi?.boundaries;
 const forensiSafe=fContract?.automatic_media_transfer_allowed===false &&
  fContract?.runtime_analysis_action_contracted===false &&
  fContract?.secure_machine_media_intake==='verification_gated';
 const forensiState=!avCount?'NOT_APPLICABLE_NO_AUDIO_VIDEO':
   !forensiSafe?'HOLD_FORENSISCOPE_CONTRACT_UNVERIFIED':
   !software.has('forensiscope')?'HOLD_SABAN_ADAPTER_MISSING':
   'HOLD_RIGHTS_REVIEW_AND_AUTHORIZED_LOCAL_SOURCE_VALIDATION';
 const formation=media?capacityProposal(software.get('fallen-production'),
    {workItems:receipt.assets.length,logical:6,physical:2})
    :capacityProposal(null);
 const forensicFormation=avCount&&forensiSafe?
    capacityProposal(software.get('forensiscope'),
      {workItems:avCount,logical:6,physical:2}):
    capacityProposal(null);
 const departments=[
  row('systemia','INERT_INTAKE_CANDIDATE_RECORDED',{
    next:'INDEPENDENT_ADMISSION_AND_NAMED_PRODUCTION_SCOPE'}),
  row('passport','INTAKE_WRITE_ONLY',{
    next:'NEW_SEPARATE_SCOPE_REQUIRED_FOR_PRODUCTION_OR_FORENSICS'}),
  row('saban','CAPACITY_PROPOSALS_ONLY',{
    boundedFallenFormation:formation,boundedForensiScopeFormation:forensicFormation,
    next:'RUNTIME_PREFLIGHT_AND_AUTHORIZED_MISSION_LEASE'}),
  row('forensiscope',forensiState,{
    mediaCandidates:avCount,contractDeclared:!!forensi,
    sourceValidator:'systemia/forensiscope/authorized-source.mjs',
    actualMediaAnalysisExecuted:false}),
  row('fallen','HOLD_NAMED_PRODUCER_SCOPE_RIGHTS_AND_INDEPENDENT_QC',{
    productionAdapterRegistered:software.has('fallen-production'),
    creativeCouncilRegistered:software.has('fallen-creative-council'),
    shotTournamentRegistered:software.has('fallen-shot-tournament')}),
  row('evercraft-clip','HOLD_APPROVED_DERIVATIVE_AND_SEPARATE_SCOPE',{
    productContractDeclared:!!clip}),
  row('harbor','HOLD_EXACT_PREVIEW_RELEASE_AND_NATIVE_META_GUARD',{
    customerResponseVerified:false,previewSendPerformed:false}),
  row('hudson','REDACTED_METRICS_ONLY_NOT_PUBLISHED',{
    publicObservationStarted:false}),
  row('kaidance','HEARTBEAT_PROPOSAL_ONLY',{
    durableRuntimeHeartbeatObserved:false}),
  row('raven-nexus','SEPARATE_PRIVACY_AND_TRUST_GATE',{
    privateSourceAccessGranted:false}),
  row('guardian','SEPARATE_RIGHTS_AND_SAFETY_REVIEW',{
    mediaRightsVerified:false}),
  row('evercraft-payments','HOLD_CUSTOMER_APPROVAL_AND_PROVIDER_RECEIPT',{
    paymentObserved:false}),
  row('shipping','HOLD_APPROVED_MASTER_AND_PROVIDER_PAYMENT',{
    deliveryReadbackObserved:false}),
  row('portfolio-sentinel','REGISTERED_CAPABILITY_COVERAGE_AUDIT_ONLY',{
    sourceInventoryOnly:true})
 ];
 return Object.freeze({
  schema:ONE_COMPANY_COURIER_SCHEMA,
  packageId:receipt.id,
  intakeCandidateId:intake.candidateId,
  stage:'AWAITING_SEPARATE_SYSTEMIA_MISSION_ADMISSION',
  mediaAssetCount:receipt.assets.length,
  audioVideoAssetCount:avCount,
  capabilityCoverage:inventory,
  departments,
  // No sensitive source asset filenames, hashes or byte paths in this
  // planning projection. They stay in the owner-private custody receipt.
  sourceFilenamesIncluded:false,sourceHashesIncluded:false,
  realNodeRuntimeObserved:false,workerDispatched:false,
  forensiScopeMediaAutoTransfer:false,customerMediaTransmitted:false,
  previewSent:false,paymentInitiated:false,shippingInitiated:false,
  productionAuthority:false,
  nextAllowedOwnerAction:'RECONCILE_AUTHENTIC_PASSPORT_AND_FALLEN_ASSIGNMENT'
 });
}
