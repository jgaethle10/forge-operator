/**
 * HIST-TECH-001 Stage 7: file-bound DC time-series intake.
 * Reads exact-header CSV samples under a scoped local root, checks SHA-256 against
 * a self-declared manifest, then calls the existing time-series energy analyzer.
 * This is byte integrity + numeric bookkeeping, NOT acquisition authentication.
 */
import {createHash} from 'node:crypto';
import {readFileSync, lstatSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzeTimeSeriesEnergy} from './time-series-energy.mjs';

const HEADER='tSeconds,voltageVolts,currentAmps,absolutePowerBoundWatts';
const SHA256=/^[a-f0-9]{64}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const MAX_BYTES=2*1024*1024;

function requireText(v,name) {
  if(typeof v!=='string' || !v.trim()) throw new Error(name+' must be nonempty text');
  return v;
}
function utcTime(value,name) {
  requireText(value,name);
  if(!UTC.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(name+' must be UTC ISO timestamp');
  return Date.parse(value);
}
function safeFile(root,relativePath) {
  requireText(relativePath,'relativePath');
  const parts=relativePath.split('/');
  if(path.isAbsolute(relativePath) || relativePath.includes('\\') ||
    relativePath.includes(':') || parts.some(p=>!p || p==='.' || p==='..')) {
    throw new Error('Unsafe relative raw-data path');
  }
  let current=realpathSync(root);
  for(const part of parts) {
    current=path.join(current,part);
    const info=lstatSync(current);
    if(info.isSymbolicLink()) throw new Error('Raw-data symlink forbidden');
  }
  const stat=lstatSync(current);
  if(!stat.isFile() || stat.size===0 || stat.size>MAX_BYTES) throw new Error('Raw-data file size invalid');
  return readFileSync(current);
}
function parseCSV(bytes) {
  const str=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(str.includes('\0') || /(?<!\r)\r(?!\n)/.test(str)) throw new Error('Unsupported raw data encoding');
  const lines=str.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');
  if(lines[0]!==HEADER) throw new Error('Exact CSV header required');
  if(lines.length<4 || lines.length>10001) throw new Error('CSV needs 3 to 10000 samples');
  return lines.slice(1).map((line,i)=>{
    const cells=line.split(',');
    if(cells.length!==4 || cells.some(v=>v.trim()==='')) throw new Error('CSV row must have exactly four numeric fields');
    const fields=cells.map(v=>Number(v));
    if(fields.some(v=>!Number.isFinite(v))) throw new Error('Nonfinite numeric CSV field');
    return {tSeconds:fields[0],voltageVolts:fields[1],
      currentAmps:fields[2],absolutePowerBoundWatts:fields[3]};
  });
}
export function inspectTimeSeriesBundle({rootDirectory,manifest}) {
  if(typeof rootDirectory!=='string' || !path.isAbsolute(rootDirectory)) {
    throw new Error('Explicit absolute evidence root required');
  }
  if(!manifest || typeof manifest!=='object' || Array.isArray(manifest)) throw new Error('Manifest object required');
  if(manifest.schema!=='evercraft.historical-tech.time-series-bundle.v1') throw new Error('Unknown time-series bundle schema');
  const kind=manifest.dataKind;
  if(kind!=='synthetic' && kind!=='measured') throw new Error('Bundle must explicitly state synthetic or measured');
  const id=requireText(manifest.sessionId,'sessionId');
  const captured=utcTime(manifest.capturedAt,'capturedAt');
  if(manifest.allInputsDeclared!==true || manifest.synchronizationConfirmed!==true) {
    throw new Error('Input completeness and synchronization must be explicitly self-attested');
  }
  requireText(manifest.sourceInventoryNote,'sourceInventoryNote');
  const maxGap=manifest.maxGapSeconds;
  if(typeof maxGap!=='number' || !Number.isFinite(maxGap) || maxGap<=0) throw new Error('Invalid maxGapSeconds');
  if(!Array.isArray(manifest.channels) || manifest.channels.length<2 || manifest.channels.length>33) {
    throw new Error('Require one loaded output and 1..32 input channels');
  }
  if(kind==='measured') {
    requireText(manifest.operator,'operator');
    requireText(manifest.rawSourceReference,'rawSourceReference');
    if(!manifest.safetyApproval) throw new Error('Safety metadata required for alleged measured readings');
    requireText(manifest.safetyApproval.approver,'safety approver');
    requireText(manifest.safetyApproval.recordRef,'safety record');
    if(utcTime(manifest.safetyApproval.approvedAt,'safety approval timestamp')>captured) {
      throw new Error('Claimed safety approval follows capture');
    }
  }
  const usedIds=new Set(), usedPaths=new Set();
  const inputSources=[];
  let loadedOutput=null;
  const checkedFiles=[];
  for(const channel of manifest.channels) {
    if(!channel || (channel.role!=='input' && channel.role!=='loaded_output')) throw new Error('Invalid channel role');
    const channelId=requireText(channel.id,'channel id');
    const relative=requireText(channel.relativePath,'channel path');
    if(usedIds.has(channelId)) throw new Error('Duplicate channel ID');
    if(usedPaths.has(relative)) throw new Error('Duplicate raw-data path');
    usedIds.add(channelId); usedPaths.add(relative);
    if(!SHA256.test(channel.sha256)) throw new Error('Expected lowercase SHA-256 hash');
    if(kind==='measured') {
      for(const field of ['instrumentManufacturer','instrumentModel','instrumentSerial','calibrationRecordRef']) {
        requireText(channel[field],field);
      }
      if(utcTime(channel.calibrationValidUntil,'calibrationValidUntil')<captured) {
        throw new Error('Claimed instrument calibration expired before capture');
      }
    }
    const bytes=safeFile(rootDirectory,relative);
    const actual=createHash('sha256').update(bytes).digest('hex');
    if(actual!==channel.sha256) throw new Error('SHA-256 mismatch: '+channelId);
    const data={id:channelId,samples:parseCSV(bytes)};
    if(channel.role==='loaded_output') {
      if(loadedOutput) throw new Error('Exactly one loaded output is allowed');
      loadedOutput=data;
    } else {
      inputSources.push(data);
    }
    checkedFiles.push({channelId,sha256:actual,byteLength:bytes.length});
  }
  if(!loadedOutput || inputSources.length===0) throw new Error('Missing loaded output or input');
  const result=analyzeTimeSeriesEnergy({
    dataKind:kind,
    timebase:'synchronized_steady_dc_samples',
    sourceInventoryAttested:true,
    synchronizedSamplingAttested:true,
    sourceInventoryNote:manifest.sourceInventoryNote,
    maxGapSeconds:maxGap,inputSources,loadedOutput,
    rawSourceReference:kind==='measured'?manifest.rawSourceReference:undefined,
    operator:kind==='measured'?manifest.operator:undefined
  });
  return {
    schema:'evercraft.historical-tech.time-series-review.v1',
    sessionId:id,dataKind:kind,integrity:'bytes_match_self_declared_hashes',
    checkedFiles,analysis:result,
    externalInstrumentAuthentication:false,
    physicalCaptureVerified:false,
    reviewerSignatureVerified:false,
    publicationAllowed:false,
    scientificClaimAuthorized:false,
    note:'Self-declared hashes and metadata are not independent proof of a real capture, calibration, complete input inventory or synchronous power measurement. Numerical result only.'
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==4) throw new Error('Usage: node time-series-bundle.mjs <absolute-root-directory> <manifest.json>');
    const manifest=JSON.parse(readFileSync(process.argv[3],'utf8'));
    process.stdout.write(JSON.stringify(inspectTimeSeriesBundle({rootDirectory:process.argv[2],manifest}),null,2)+'\n');
  } catch(err) {
    process.stderr.write(err.message+'\n');
    process.exitCode=1;
  }
}
