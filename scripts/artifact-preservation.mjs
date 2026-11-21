// Evercraft Artifact Preservation v0.3: adapter-driven custody coordinator.
// Does not contain credentials, a Google Drive adapter, or an unattended scheduler.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID, createHash} from 'node:crypto';
import {fingerprint} from './artifact-roundtrip.mjs';

export const PRESERVATION_SCHEMA = 'evercraft.artifact.preservation-run.v1';
const SLUG = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const SHA = /^[a-f0-9]{64}$/;

function requireSafeId(value, label) {
  if (typeof value !== 'string' || !SLUG.test(value)) throw new Error(`invalid ${label}`);
  return value;
}
function requireDirectory(dir) {
  if (typeof dir !== 'string' || !dir) throw new Error('invalid custody directory');
  const abs = path.resolve(dir);
  // Do not traverse symlinks in the selected ledger directory.
  let cur = path.parse(abs).root;
  for (const part of abs.slice(cur.length).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error('custody directory symlink forbidden');
  }
  fs.mkdirSync(abs, {recursive:true,mode:0o700});
  if (!fs.statSync(abs).isDirectory()) throw new Error('custody directory not a directory');
  return abs;
}
function writeExclusive(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n', {flag:'wx',mode:0o600});
}
function event(runDir, index, kind, detail) {
  writeExclusive(path.join(runDir, `${String(index).padStart(2,'0')}-${kind}.json`),
    {schema:PRESERVATION_SCHEMA, kind, at_utc:new Date().toISOString(), ...detail});
}
function assertHandle(handle) {
  if (!handle || typeof handle !== 'object' || Array.isArray(handle) ||
      !['provider','object_id','account_scope'].every(k => typeof handle[k] === 'string' &&
         handle[k].trim().length > 0 && handle[k].length < 512) ||
      (handle.version_id != null && (typeof handle.version_id !== 'string' || handle.version_id.length > 512))) {
    throw new Error('storage adapter returned an invalid object handle');
  }
  return Object.freeze({provider:handle.provider,object_id:handle.object_id,
    version_id:handle.version_id ?? null,account_scope:handle.account_scope});
}
function same(a,b) {return a.size_bytes===b.size_bytes && a.sha256===b.sha256;}
/**
 * Adapter contract (private implementation only):
 *   put({source,key,expected}) => {provider,object_id,version_id,account_scope}
 *   restore({handle,destination}) => writes a regular file at destination
 * The handle is adapter-asserted, never cryptographically authenticated by this module.
 */
export async function preserveArtifact({source, project, version, adapter, custodyDir}) {
  requireSafeId(project,'project'); requireSafeId(version,'version');
  if (!adapter || typeof adapter.put !== 'function' || typeof adapter.restore !== 'function') {
    throw new Error('explicit put/restore storage adapter required');
  }
  if (typeof source !== 'string' || !source) throw new Error('source path required');
  if (/^(?:\.env(?:\..*)?|id_(?:rsa|ed25519)|credentials(?:\.json)?|secrets?(?:\..*)?|.*\.(?:pem|p12|pfx|key))$/i.test(path.basename(source))) {
    throw new Error('sensitive filename blocked from preservation');
  }
  const original = fingerprint(source); // Rejects symlinked sources and parent directories.
  if (!SHA.test(original.sha256)) throw new Error('invalid source fingerprint');
  const dir=requireDirectory(custodyDir);
  const runId=randomUUID();
  const runDir=path.join(dir,runId);
  fs.mkdirSync(runDir,{mode:0o700});
  const stageDir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-preservation-'));
  fs.chmodSync(stageDir,0o700);
  const frozenSource=path.join(stageDir,'source.bin');
  const restored=path.join(stageDir,'restored.bin');
  const key=`${project}/${version}/${original.sha256}`;
  const base={run_id:runId,project,version,sha256:original.sha256,
    size_bytes:original.size_bytes,object_key:key};
  let phase='preflight';
  try {
    fs.copyFileSync(source,frozenSource,fs.constants.COPYFILE_EXCL);
    if (!same(original,fingerprint(frozenSource))) throw new Error('source changed during staging');
    event(runDir,0,'preflight',{...base,state:'staged_local'});
    phase='upload';
    const handle=assertHandle(await adapter.put({source:frozenSource,key,expected:original}));
    event(runDir,1,'upload',{...base,state:'adapter_reported_upload',handle,
      provider_authentication:'not_independently_attested'});
    phase='restore';
    await adapter.restore({handle,destination:restored});
    const check=fingerprint(restored);
    const after=fingerprint(source);
    if (!same(original,after)) throw new Error('source changed after upload');
    if (!same(original,check)) throw new Error('retrieved artifact bytes differ from source');
    event(runDir,2,'roundtrip',{...base,state:'byte_verified',downloaded_sha256:check.sha256,
      backup_roundtrip_attested:false,provider_authentication:'not_independently_attested',
      device_install:'unverified',publication:'unverified'});
    return {schema:PRESERVATION_SCHEMA,run_id:runId,state:'byte_verified',
      receipt_directory:runDir,sha256:original.sha256,size_bytes:original.size_bytes,
      adapter_provider:handle.provider,backup_roundtrip_attested:false,
      provider_authentication:'not_independently_attested',device_install:'unverified',publication:'unverified'};
  } catch(error) {
    event(runDir,9,'failure',{...base,state:'failed',phase,
      error_code:'PRESERVATION_FAILED',error_class:error?.name||'Error'});
    // Do not write raw error messages, paths or tokens to persisted receipts.
    throw error;
  } finally {
    fs.rmSync(stageDir,{recursive:true,force:true});
  }
}

/** ONLY for isolated tests and explicit local demos. Not a cloud storage adapter. */
export function localFixtureAdapter(root) {
  const localRoot=requireDirectory(root);
  return {
    async put({source,key}) {
      const id=createHash('sha256').update(key).digest('hex');
      const location=path.join(localRoot,`${id}.bin`);
      // Deduplicate identical immutable objects for repeat runs; never overwrite changed bytes.
      if (fs.existsSync(location)) {
        if (!same(fingerprint(location),fingerprint(source))) throw new Error('immutable fixture object collision');
      } else {
        fs.copyFileSync(source,location,fs.constants.COPYFILE_EXCL);
      }
      return {provider:'local-fixture-only',object_id:id,account_scope:'local-test',version_id:null};
    },
    async restore({handle,destination}) {
      if(handle.provider!=='local-fixture-only'||!/^[a-f0-9]{64}$/.test(handle.object_id)) throw new Error('invalid fixture handle');
      fs.copyFileSync(path.join(localRoot,`${handle.object_id}.bin`),destination,fs.constants.COPYFILE_EXCL);
    }
  };
}
