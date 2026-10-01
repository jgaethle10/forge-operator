import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FilmBenchmarkSnapshot } from './film-regression-lab.js';
import type { NarrativeFilmAdmissionReceipt } from './narrative-film-admission.js';
import type { StudioDeliveryReceipt, ClipDeliveryManifest } from './studio-delivery.js';
import type { TimelineExportReceipt } from './timeline-export.js';
import type { StudioMasterQcReceipt } from './master-qc.js';

export interface FilmProofEvidenceFile {
  role:string;
  path:string;
  expectedSha256?:string;
  sourceRefs?:string[];
}

export interface FilmProofBundleInput {
  schema:'evercraft.fallen.film-proof-bundle-input.v1';
  id:string;
  filmAdmission:NarrativeFilmAdmissionReceipt;
  benchmark:FilmBenchmarkSnapshot;
  delivery:StudioDeliveryReceipt;
  evidenceFiles?:FilmProofEvidenceFile[];
  sourceRefs:string[];
  includeMaster?:boolean;
}

export interface FilmProofFileEntry {
  role:string;
  relativePath:string;
  sha256:string;
  sizeBytes:number;
  sourcePath?:string;
  sourceRefs:string[];
}

export interface FilmProofManifest {
  schema:'evercraft.fallen.film-proof-manifest.v1';
  bundleId:string;
  projectId:string;
  projectVersion:number;
  sequenceId:string;
  filmAdmissionDigest:string;
  benchmarkSnapshotDigest:string;
  masterSha256:string;
  deliveryManifestSha256:string;
  files:FilmProofFileEntry[];
  sourceRefs:string[];
  manifestDigest:string;
  boundaries:{
    exactMasterDigestBound:true;
    exactDeliveryManifestBound:true;
    admissionAndBenchmarkEmbedded:true;
    evidenceFilesHashBound:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface FilmProofBundleReceipt {
  schema:'evercraft.fallen.film-proof-bundle-receipt.v1';
  bundleId:string;
  bundleDir:string;
  manifestPath:string;
  manifestSha256:string;
  verificationStatus:'accepted';
  fileCount:number;
  masterIncluded:boolean;
  publicationAuthorityGranted:false;
  createdAt:string;
}

export interface FilmProofVerification {
  schema:'evercraft.fallen.film-proof-verification.v1';
  bundleId?:string;
  status:'accepted'|'rejected';
  reasons:string[];
  checkedFiles:number;
  manifestSha256?:string;
  verifiedAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function objectDigest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function hashBytes(bytes:Buffer){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function hashFile(filePath:string){
  return hashBytes(fs.readFileSync(filePath));
}

function cleanDigest(value:string){
  return value.replace(/^sha256:/,'').toLowerCase();
}

function safe(value:string){
  const out=value.trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,100);
  if(!out) throw new Error('film_proof_safe_name_invalid');
  return out;
}

function assertFile(filePath:string,label:string){
  if(!fs.existsSync(filePath)) throw new Error('film_proof_file_missing:'+label);
  if(!fs.statSync(filePath).isFile()) throw new Error('film_proof_not_file:'+label);
}

function parseJson<T>(filePath:string,label:string):T{
  try{
    return JSON.parse(fs.readFileSync(filePath,'utf8')) as T;
  }catch{
    throw new Error('film_proof_json_invalid:'+label);
  }
}

function writeJson(filePath:string,value:unknown){
  fs.mkdirSync(path.dirname(filePath),{recursive:true});
  fs.writeFileSync(filePath,JSON.stringify(value,null,2)+'\n','utf8');
}

function copyEntry(input:{
  role:string;
  sourcePath:string;
  destinationPath:string;
  expectedSha256?:string;
  sourceRefs?:string[];
}):FilmProofFileEntry{
  assertFile(input.sourcePath,input.role);
  const sourceDigest=hashFile(input.sourcePath);
  if(input.expectedSha256&&sourceDigest!==cleanDigest(input.expectedSha256)){
    throw new Error('film_proof_source_digest_mismatch:'+input.role);
  }
  fs.mkdirSync(path.dirname(input.destinationPath),{recursive:true});
  fs.copyFileSync(input.sourcePath,input.destinationPath);
  const copiedDigest=hashFile(input.destinationPath);
  if(copiedDigest!==sourceDigest) throw new Error('film_proof_copy_digest_mismatch:'+input.role);
  return {
    role:input.role,
    relativePath:path.basename(input.destinationPath),
    sha256:copiedDigest,
    sizeBytes:fs.statSync(input.destinationPath).size,
    sourcePath:path.resolve(input.sourcePath),
    sourceRefs:[...new Set(input.sourceRefs??[])],
  };
}

function validateCore(input:FilmProofBundleInput){
  if(input.schema!=='evercraft.fallen.film-proof-bundle-input.v1'){
    throw new Error('film_proof_input_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('film_proof_id_missing');
  if(!input.sourceRefs?.length) throw new Error('film_proof_source_refs_missing');
  if(input.filmAdmission.schema!=='evercraft.fallen.narrative-film-admission.v1'){
    throw new Error('film_proof_admission_schema_invalid');
  }
  if(input.filmAdmission.status!=='accepted'){
    throw new Error('film_proof_admission_not_accepted');
  }
  if(input.benchmark.schema!=='evercraft.fallen.film-benchmark-snapshot.v1'){
    throw new Error('film_proof_benchmark_schema_invalid');
  }
  if(input.benchmark.status!=='accepted'){
    throw new Error('film_proof_benchmark_not_accepted');
  }
  if(input.delivery.schema!=='evercraft.fallen.studio-delivery-receipt.v1'){
    throw new Error('film_proof_delivery_schema_invalid');
  }
  if(input.delivery.qualityMode!=='narrative_film'){
    throw new Error('film_proof_delivery_not_narrative_film');
  }
  if(cleanDigest(input.benchmark.metrics.master.sha256)!==cleanDigest(input.delivery.mediaSha256)){
    throw new Error('film_proof_benchmark_master_delivery_mismatch');
  }
  if(cleanDigest(input.benchmark.metrics.delivery.mediaSha256)!==cleanDigest(input.delivery.mediaSha256)){
    throw new Error('film_proof_benchmark_delivery_mismatch');
  }
}

function validateDeliveryFiles(input:FilmProofBundleInput){
  const delivery=input.delivery;
  assertFile(delivery.videoPath,'master_video');
  assertFile(delivery.renderReceiptPath,'render_receipt');
  assertFile(delivery.masterQcReceiptPath,'master_qc');
  assertFile(delivery.clipManifestPath,'clip_manifest');

  const mediaSha=hashFile(delivery.videoPath);
  if(mediaSha!==cleanDigest(delivery.mediaSha256)){
    throw new Error('film_proof_master_digest_mismatch');
  }
  if(hashFile(delivery.clipManifestPath)!==cleanDigest(delivery.manifestSha256)){
    throw new Error('film_proof_clip_manifest_digest_mismatch');
  }

  const render=parseJson<TimelineExportReceipt>(delivery.renderReceiptPath,'render_receipt');
  const qc=parseJson<StudioMasterQcReceipt>(delivery.masterQcReceiptPath,'master_qc');
  const clip=parseJson<ClipDeliveryManifest>(delivery.clipManifestPath,'clip_manifest');

  if(render.schema!=='evercraft.fallen.timeline-export-receipt.v1'){
    throw new Error('film_proof_render_receipt_schema_invalid');
  }
  if(cleanDigest(render.sha256)!==mediaSha){
    throw new Error('film_proof_render_receipt_master_mismatch');
  }
  if(qc.schema!=='evercraft.fallen.master-qc-receipt.v1'||qc.status!=='accepted'){
    throw new Error('film_proof_master_qc_not_accepted');
  }
  if(cleanDigest(qc.sha256)!==mediaSha){
    throw new Error('film_proof_master_qc_master_mismatch');
  }
  if(clip.schema!=='evercraft.clip.media-intake.v1'){
    throw new Error('film_proof_clip_manifest_schema_invalid');
  }
  if(clip.qualityMode!=='narrative_film'){
    throw new Error('film_proof_clip_manifest_not_narrative_film');
  }
  if(cleanDigest(clip.media.sha256)!==mediaSha){
    throw new Error('film_proof_clip_manifest_master_mismatch');
  }
  if(clip.provenance.narrativeFilmAdmissionDigest!==input.filmAdmission.admissionDigest){
    throw new Error('film_proof_clip_admission_digest_mismatch');
  }
  if(
    clip.sourceProjectId!==input.filmAdmission.projectId||
    clip.sourceProjectVersion!==input.filmAdmission.projectVersion
  ){
    throw new Error('film_proof_clip_project_binding_mismatch');
  }
  if(render.projectId!==input.filmAdmission.projectId||
     render.projectVersion!==input.filmAdmission.projectVersion){
    throw new Error('film_proof_render_project_binding_mismatch');
  }

  return {mediaSha,render,qc,clip};
}

export function materializeFilmProofBundle(input:{
  bundle:FilmProofBundleInput;
  outputDir:string;
}):FilmProofBundleReceipt{
  validateCore(input.bundle);
  const validated=validateDeliveryFiles(input.bundle);
  const bundleDir=path.resolve(input.outputDir,safe(input.bundle.id));
  if(fs.existsSync(bundleDir)) fs.rmSync(bundleDir,{recursive:true,force:true});
  fs.mkdirSync(bundleDir,{recursive:true});

  const files:FilmProofFileEntry[]=[];

  const admissionPath=path.join(bundleDir,'film-admission.json');
  writeJson(admissionPath,input.bundle.filmAdmission);
  files.push({
    role:'film_admission',
    relativePath:path.basename(admissionPath),
    sha256:hashFile(admissionPath),
    sizeBytes:fs.statSync(admissionPath).size,
    sourceRefs:['film-admission:'+input.bundle.filmAdmission.admissionDigest],
  });

  const benchmarkPath=path.join(bundleDir,'benchmark-snapshot.json');
  writeJson(benchmarkPath,input.bundle.benchmark);
  files.push({
    role:'benchmark_snapshot',
    relativePath:path.basename(benchmarkPath),
    sha256:hashFile(benchmarkPath),
    sizeBytes:fs.statSync(benchmarkPath).size,
    sourceRefs:['benchmark:'+input.bundle.benchmark.snapshotDigest],
  });

  files.push(copyEntry({
    role:'render_receipt',
    sourcePath:input.bundle.delivery.renderReceiptPath,
    destinationPath:path.join(bundleDir,'render-receipt.json'),
    sourceRefs:['master-sha256:'+validated.mediaSha],
  }));
  files.push(copyEntry({
    role:'master_qc',
    sourcePath:input.bundle.delivery.masterQcReceiptPath,
    destinationPath:path.join(bundleDir,'master-qc.json'),
    sourceRefs:['master-sha256:'+validated.mediaSha],
  }));
  files.push(copyEntry({
    role:'clip_manifest',
    sourcePath:input.bundle.delivery.clipManifestPath,
    destinationPath:path.join(bundleDir,'clip-manifest.json'),
    expectedSha256:input.bundle.delivery.manifestSha256,
    sourceRefs:['film-admission:'+input.bundle.filmAdmission.admissionDigest],
  }));

  if(input.bundle.includeMaster===true){
    const ext=path.extname(input.bundle.delivery.videoPath)||'.mp4';
    files.push(copyEntry({
      role:'master_video',
      sourcePath:input.bundle.delivery.videoPath,
      destinationPath:path.join(bundleDir,'master'+ext),
      expectedSha256:input.bundle.delivery.mediaSha256,
      sourceRefs:['narrative-master'],
    }));
  }

  const evidenceDir=path.join(bundleDir,'evidence');
  const seenRoles=new Set<string>();
  for(const [index,evidence] of (input.bundle.evidenceFiles??[]).entries()){
    if(!evidence.role?.trim()) throw new Error('film_proof_evidence_role_missing:'+index);
    const role=safe(evidence.role);
    const key=role+'|'+path.resolve(evidence.path);
    if(seenRoles.has(key)) throw new Error('film_proof_duplicate_evidence:'+role);
    seenRoles.add(key);
    const ext=path.extname(evidence.path).slice(0,12);
    const filename=String(index+1).padStart(3,'0')+'-'+role+(ext||'.bin');
    const entry=copyEntry({
      role:'evidence:'+role,
      sourcePath:evidence.path,
      destinationPath:path.join(evidenceDir,filename),
      expectedSha256:evidence.expectedSha256,
      sourceRefs:evidence.sourceRefs,
    });
    entry.relativePath=path.relative(bundleDir,path.join(evidenceDir,filename)).replace(/\\/g,'/');
    files.push(entry);
  }

  const manifestCore={
    schema:'evercraft.fallen.film-proof-manifest.v1' as const,
    bundleId:input.bundle.id,
    projectId:input.bundle.filmAdmission.projectId,
    projectVersion:input.bundle.filmAdmission.projectVersion,
    sequenceId:input.bundle.filmAdmission.sequenceId,
    filmAdmissionDigest:input.bundle.filmAdmission.admissionDigest,
    benchmarkSnapshotDigest:input.bundle.benchmark.snapshotDigest,
    masterSha256:validated.mediaSha,
    deliveryManifestSha256:cleanDigest(input.bundle.delivery.manifestSha256),
    files:files
      .map(entry=>({...entry}))
      .sort((a,b)=>a.relativePath.localeCompare(b.relativePath)),
    sourceRefs:[...new Set(input.bundle.sourceRefs)],
    createdAt:new Date().toISOString(),
    boundaries:{
      exactMasterDigestBound:true as const,
      exactDeliveryManifestBound:true as const,
      admissionAndBenchmarkEmbedded:true as const,
      evidenceFilesHashBound:true as const,
      publicationAuthorityGranted:false as const,
    },
  };
  const manifest:FilmProofManifest={
    ...manifestCore,
    manifestDigest:objectDigest({...manifestCore,createdAt:undefined}),
  };
  const manifestPath=path.join(bundleDir,'proof-manifest.json');
  writeJson(manifestPath,manifest);
  const manifestSha256=hashFile(manifestPath);

  const verification=verifyFilmProofBundle(bundleDir);
  if(verification.status!=='accepted'){
    throw new Error('film_proof_postwrite_verification_failed:'+verification.reasons.join('|'));
  }

  const receipt:FilmProofBundleReceipt={
    schema:'evercraft.fallen.film-proof-bundle-receipt.v1',
    bundleId:input.bundle.id,
    bundleDir,
    manifestPath,
    manifestSha256,
    verificationStatus:'accepted',
    fileCount:manifest.files.length,
    masterIncluded:input.bundle.includeMaster===true,
    publicationAuthorityGranted:false,
    createdAt:new Date().toISOString(),
  };
  writeJson(path.join(bundleDir,'bundle-receipt.json'),receipt);
  return receipt;
}

export function verifyFilmProofBundle(bundleDir:string):FilmProofVerification{
  const root=path.resolve(bundleDir);
  const manifestPath=path.join(root,'proof-manifest.json');
  const reasons:string[]=[];
  if(!fs.existsSync(manifestPath)){
    return {
      schema:'evercraft.fallen.film-proof-verification.v1',
      status:'rejected',
      reasons:['proof_manifest_missing'],
      checkedFiles:0,
      verifiedAt:new Date().toISOString(),
    };
  }

  let manifest:FilmProofManifest;
  try{
    manifest=parseJson<FilmProofManifest>(manifestPath,'proof_manifest');
  }catch{
    return {
      schema:'evercraft.fallen.film-proof-verification.v1',
      status:'rejected',
      reasons:['proof_manifest_invalid_json'],
      checkedFiles:0,
      manifestSha256:hashFile(manifestPath),
      verifiedAt:new Date().toISOString(),
    };
  }

  if(manifest.schema!=='evercraft.fallen.film-proof-manifest.v1'){
    reasons.push('proof_manifest_schema_invalid');
  }
  const expectedManifestDigest=objectDigest({
    ...manifest,
    manifestDigest:undefined,
    createdAt:undefined,
  });
  if(manifest.manifestDigest!==expectedManifestDigest){
    reasons.push('proof_manifest_object_digest_mismatch');
  }

  let checkedFiles=0;
  for(const entry of manifest.files??[]){
    const full=path.resolve(root,entry.relativePath);
    const relative=path.relative(root,full);
    if(relative.startsWith('..')||path.isAbsolute(relative)){
      reasons.push('proof_entry_path_escape:'+entry.relativePath);
      continue;
    }
    if(!fs.existsSync(full)){
      reasons.push('proof_entry_missing:'+entry.relativePath);
      continue;
    }
    if(hashFile(full)!==cleanDigest(entry.sha256)){
      reasons.push('proof_entry_digest_mismatch:'+entry.relativePath);
      continue;
    }
    if(fs.statSync(full).size!==entry.sizeBytes){
      reasons.push('proof_entry_size_mismatch:'+entry.relativePath);
      continue;
    }
    checkedFiles+=1;
  }

  const admissionPath=path.join(root,'film-admission.json');
  const benchmarkPath=path.join(root,'benchmark-snapshot.json');
  const qcPath=path.join(root,'master-qc.json');
  const clipPath=path.join(root,'clip-manifest.json');
  for(const [label,file] of [
    ['film_admission',admissionPath],
    ['benchmark_snapshot',benchmarkPath],
    ['master_qc',qcPath],
    ['clip_manifest',clipPath],
  ] as const){
    if(!fs.existsSync(file)){
      reasons.push('proof_required_file_missing:'+label);
    }
  }

  if(fs.existsSync(admissionPath)&&fs.existsSync(benchmarkPath)&&fs.existsSync(qcPath)&&fs.existsSync(clipPath)){
    const admission=parseJson<NarrativeFilmAdmissionReceipt>(admissionPath,'film_admission');
    const benchmark=parseJson<FilmBenchmarkSnapshot>(benchmarkPath,'benchmark_snapshot');
    const qc=parseJson<StudioMasterQcReceipt>(qcPath,'master_qc');
    const clip=parseJson<ClipDeliveryManifest>(clipPath,'clip_manifest');
    if(admission.status!=='accepted') reasons.push('proof_admission_not_accepted');
    if(benchmark.status!=='accepted') reasons.push('proof_benchmark_not_accepted');
    if(qc.status!=='accepted') reasons.push('proof_master_qc_not_accepted');
    if(admission.admissionDigest!==manifest.filmAdmissionDigest){
      reasons.push('proof_admission_digest_binding_mismatch');
    }
    if(benchmark.snapshotDigest!==manifest.benchmarkSnapshotDigest){
      reasons.push('proof_benchmark_digest_binding_mismatch');
    }
    if(cleanDigest(qc.sha256)!==cleanDigest(manifest.masterSha256)){
      reasons.push('proof_qc_master_binding_mismatch');
    }
    if(cleanDigest(clip.media.sha256)!==cleanDigest(manifest.masterSha256)){
      reasons.push('proof_clip_master_binding_mismatch');
    }
    if(clip.provenance.narrativeFilmAdmissionDigest!==manifest.filmAdmissionDigest){
      reasons.push('proof_clip_admission_binding_mismatch');
    }
  }

  return {
    schema:'evercraft.fallen.film-proof-verification.v1',
    bundleId:manifest.bundleId,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    checkedFiles,
    manifestSha256:hashFile(manifestPath),
    verifiedAt:new Date().toISOString(),
  };
}
