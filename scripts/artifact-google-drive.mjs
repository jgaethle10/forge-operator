// Evercraft Artifact Preservation: explicit Google Drive v3 private storage adapter.
// This module never reads user credentials on import and never schedules itself.
// Network access only occurs when a caller supplies an OAuth access token and calls put/restore.
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { fingerprint } from './artifact-roundtrip.mjs';

const API = 'https://www.googleapis.com';
const FOLDER_ID = /^[A-Za-z0-9_-]{10,180}$/;
const OBJECT_ID = /^[A-Za-z0-9_-]{10,180}$/;
const KEY = /^([a-z0-9][a-z0-9._-]{1,79})\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/([a-f0-9]{64})$/;
const SHA = /^[a-f0-9]{64}$/;
// Bound memory use until a chunked uploader is added.
const MAX_BYTES = 128 * 1024 * 1024;

function assert(condition, message) { if (!condition) throw new Error(message); }
function validateSessionUrl(location) {
  let u;
  try { u = new URL(location); } catch { throw new Error('invalid Google upload session URL'); }
  assert(u.protocol === 'https:' && ['www.googleapis.com', 'upload.googleapis.com'].includes(u.hostname) &&
    u.username === '' && u.password === '' && !u.hash, 'untrusted Google upload session URL');
  assert(u.pathname.startsWith('/upload/'), 'unexpected Google upload session URL path');
  return u.href;
}
function providerError(response, phase) {
  // Do not print the provider response body: it might contain a token or private filename.
  throw new Error(`Google Drive ${phase} failed with HTTP ${response.status}`);
}
async function json(response, phase) {
  if (!response.ok) providerError(response, phase);
  try { return await response.json(); }
  catch { throw new Error(`Google Drive ${phase} returned invalid JSON`); }
}
function makeHeaders(accessToken, additional={}) {
  return {Authorization:`Bearer ${accessToken}`, ...additional};
}
function objectName(key) {
  const match = KEY.exec(key);
  assert(match, 'invalid immutable object key');
  return `evercraft-${match[1]}-${match[2]}-${match[3]}.bin`;
}
function checkMetadata(metadata, {folderId, objectId, name, expectedSize}) {
  assert(metadata && metadata.id === objectId && metadata.trashed !== true, 'Google Drive object identity mismatch');
  assert(Array.isArray(metadata.parents) && metadata.parents.length === 1 && metadata.parents[0] === folderId,
    'Google Drive object outside authorized custody folder');
  assert(metadata.name === name, 'Google Drive object name mismatch');
  if (expectedSize !== undefined) assert(Number(metadata.size) === expectedSize, 'Google Drive object size mismatch');
}
function validateDownloadFile(destination) {
  assert(typeof destination === 'string' && destination && !destination.includes('\0'), 'invalid restore destination');
  const abs = path.resolve(destination);
  assert(fs.existsSync(path.dirname(abs)), 'restore destination directory missing');
  let p = path.parse(abs).root;
  for (const seg of abs.slice(p.length).split(path.sep).filter(Boolean)) {
    p = path.join(p, seg);
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('restore symlink path denied');
  }
  assert(!fs.existsSync(abs), 'restore destination must not exist');
  return abs;
}

/**
 * The caller, not this module, owns credential acquisition/refresh and folder authorization.
 * A read-back SHA-256 match is performed by preserveArtifact, not by this adapter.
 * The injected fetch function is ONLY for isolated offline tests.
 */
export function googleDriveAdapter({accessToken, folderId, fetchImpl=fetch, maxBytes=MAX_BYTES}) {
  assert(typeof accessToken === 'string' && accessToken.trim().length >= 12 && !/\s/.test(accessToken), 'explicit Google OAuth access token required');
  assert(typeof folderId === 'string' && FOLDER_ID.test(folderId), 'explicit approved Drive folder ID required');
  assert(typeof fetchImpl === 'function', 'HTTP fetch implementation required');
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'invalid size bound');
  const known = new Map(); // In-memory only; not an independent provider attestation.
  const request = (url, init={}) => fetchImpl(url, {...init,redirect:'error'});
  async function metadataFor(id) {
    assert(OBJECT_ID.test(id), 'invalid Google Drive object ID');
    const url=`${API}/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,parents,size,trashed,mimeType`;
    return json(await request(url,{method:'GET',headers:makeHeaders(accessToken)}),'metadata');
  }
  return {
    async put({source,key,expected}) {
      const name=objectName(key);
      assert(expected && SHA.test(expected.sha256) && key.endsWith('/'+expected.sha256), 'object key does not match requested artifact hash');
      assert(Number.isSafeInteger(expected.size_bytes) && expected.size_bytes >= 0 && expected.size_bytes <= maxBytes,
        'artifact outside approved upload size bound');
      const stat=fs.statSync(source);
      assert(stat.isFile() && stat.size===expected.size_bytes, 'upload source changed before transfer');
      const headers=makeHeaders(accessToken,{
        'Content-Type':'application/json; charset=UTF-8',
        'X-Upload-Content-Type':'application/octet-stream',
        'X-Upload-Content-Length':String(expected.size_bytes)
      });
      const start=await request(`${API}/upload/drive/v3/files?uploadType=resumable&fields=id,name,parents,size,trashed`,{
        method:'POST',headers,body:JSON.stringify({name,parents:[folderId],mimeType:'application/octet-stream'})});
      if (!start.ok) providerError(start,'session initiation');
      const session=validateSessionUrl(start.headers.get('location'));
      // Buffered, bounded upload avoids an unconsumed stream on immediate HTTP errors.
      const bytes=fs.readFileSync(source);
      assert(bytes.length===expected.size_bytes, 'upload source changed while reading');
      const sent=await request(session,{
        method:'PUT',headers:makeHeaders(accessToken,{'Content-Type':'application/octet-stream','Content-Length':String(expected.size_bytes)}),
        body:bytes});
      const uploaded=await json(sent,'upload');
      assert(typeof uploaded.id==='string' && OBJECT_ID.test(uploaded.id), 'Drive upload missing object ID');
      const remote=await metadataFor(uploaded.id);
      checkMetadata(remote,{folderId,objectId:uploaded.id,name,expectedSize:expected.size_bytes});
      known.set(uploaded.id,{name,size:expected.size_bytes});
      return {provider:'google-drive-v3',object_id:uploaded.id,account_scope:'approved-private-folder',version_id:null};
    },
    async restore({handle,destination}) {
      assert(handle?.provider==='google-drive-v3' && typeof handle?.object_id==='string', 'invalid Drive restore handle');
      const identity=known.get(handle.object_id);
      assert(identity, 'restore only permitted for objects uploaded during this adapter session');
      const abs=validateDownloadFile(destination);
      const remote=await metadataFor(handle.object_id);
      checkMetadata(remote,{folderId,objectId:handle.object_id,name:identity.name,expectedSize:identity.size});
      const url=`${API}/drive/v3/files/${encodeURIComponent(handle.object_id)}?alt=media`;
      const response=await request(url,{method:'GET',headers:makeHeaders(accessToken)});
      if (!response.ok) providerError(response,'download');
      assert(response.body, 'Drive returned empty download stream');
      const temp=`${abs}.part-${randomUUID()}`;
      try {
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temp,{flags:'wx',mode:0o600}));
        fs.copyFileSync(temp,abs,fs.constants.COPYFILE_EXCL);
      } finally { fs.rmSync(temp,{force:true}); }
      assert(fingerprint(abs).size_bytes === identity.size, 'download size mismatch');
    }
  };
}
