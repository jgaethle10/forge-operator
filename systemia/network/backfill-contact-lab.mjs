// Evercraft Network: disconnected backfill / contact-window SOFTWARE EMULATOR.
// No radio, satellite, carrier connectivity, real contact discovery, or field proof.
// Reuses the canonical destination-authenticated AES-GCM envelope.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {sealEnvelope, openEnvelope} from './secure-envelope.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hmac = (key,bytes) => createHmac('sha256',key).update(bytes).digest('hex');
const equal = (a,b) => typeof a==='string' && typeof b==='string' && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const keyOK = key => { if(!Buffer.isBuffer(key)||key.length!==32)throw Error('simulated_lab_requires_32_byte_key'); return key; };
const assertId = id => {if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id||''))throw Error('invalid_lab_id');return id;};
const safeRoot = root => {
  if(!path.isAbsolute(root))throw Error('absolute_root_required');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const st=fs.lstatSync(root);
  if(!st.isDirectory()||(st.mode&0o077))throw Error('root_must_be_private_0700');
  return root;
};
function storeFile(file,bytes) {
  if(fs.existsSync(file)) {
    const st=fs.lstatSync(file);
    if(!st.isFile()||(st.mode&0o077))throw Error('unsafe_existing_fragment');
    if(!fs.readFileSync(file).equals(bytes))throw Error('conflicting_fragment');
    return false;
  }
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
  return true;
}
const body = manifest => Object.fromEntries(Object.entries(manifest).filter(([k])=>k!=='proof'));
function verifyManifest(bundle,key) {
  const m=bundle?.manifest;
  if(!m||m.schema!=='evercraft.network.backfill-manifest.lab.v1')throw Error('invalid_manifest');
  assertId(m.bundle_id);assertId(m.source);assertId(m.destination);
  if(!['operator_urgent','normal','bulk'].includes(m.priority)||!Number.isInteger(m.fragment_count)||m.fragment_count<1||m.fragment_count>2048)throw Error('invalid_manifest_fields');
  if(!equal(m.proof,hmac(key,JSON.stringify(body(m)))))throw Error('unauthenticated_manifest');
  if(!Number.isFinite(Date.parse(m.expires_at))||Date.parse(m.expires_at)<=Date.now())throw Error('bundle_expired');
  if(!Array.isArray(bundle.fragments)||bundle.fragments.length!==m.fragment_count)throw Error('inconsistent_fragment_count');
  return m;
}
export function makeLabBundle({key,source,destination,message,priority='normal',fragment_bytes=300}) {
  keyOK(key);assertId(source);assertId(destination);
  if(!['operator_urgent','normal','bulk'].includes(priority))throw Error('unsupported_priority');
  if(!Number.isInteger(fragment_bytes)||fragment_bytes<64||fragment_bytes>4096)throw Error('invalid_fragment_size');
  if(typeof message!=='string'||!message.length||Buffer.byteLength(message)>256000)throw Error('invalid_message');
  const envelope=sealEnvelope({key,source,destination,kind:'continuity.message',payload:{message},expires_at:new Date(Date.now()+3600000).toISOString(),irreversible:false});
  const bytes=Buffer.from(JSON.stringify(envelope));
  const fragments=[];
  for(let i=0;i<bytes.length;i+=fragment_bytes)fragments.push(bytes.subarray(i,i+fragment_bytes).toString('base64'));
  const manifest={schema:'evercraft.network.backfill-manifest.lab.v1',bundle_id:envelope.message_id,source,destination,priority,expires_at:envelope.expires_at,fragment_count:fragments.length,total_bytes:bytes.length,bytes_sha256:sha(bytes)};
  manifest.proof=hmac(key,JSON.stringify(manifest));
  return {manifest,fragments};
}
const gatewayFolder=(root,id)=>{
  const dir=path.join(safeRoot(root),assertId(id));
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||(st.mode&0o077))throw Error('unsafe_bundle_directory');
  return dir;
};
function rebuild(bundle,dir){
  const out=[];
  for(let i=0;i<bundle.manifest.fragment_count;i++){
    const f=path.join(dir,`fragment-${i}.dat`);
    if(!fs.existsSync(f))return null;
    const st=fs.lstatSync(f);if(!st.isFile()||(st.mode&0o077))throw Error('unsafe_fragment');
    const b=fs.readFileSync(f),expected=Buffer.from(bundle.fragments[i],'base64');
    if(!b.equals(expected))throw Error('fragment_hash_mismatch');
    out.push(b);
  }
  const bytes=Buffer.concat(out);
  if(bytes.length!==bundle.manifest.total_bytes||sha(bytes)!==bundle.manifest.bytes_sha256)throw Error('bundle_integrity_failed');
  return bytes;
}
function ack(key,kind,manifest) {
  const receipt={schema:'evercraft.network.backfill-ack.lab.v1',kind,bundle_id:manifest.bundle_id,bytes_sha256:manifest.bytes_sha256,destination:manifest.destination,simulation_only:true};
  return {...receipt,proof:hmac(key,JSON.stringify(receipt))};
}
export function verifyBackfillAck({key,receipt,bundle,expected_kind}){
  keyOK(key);const m=verifyManifest(bundle,key);
  if(receipt?.kind!==expected_kind||receipt?.bundle_id!==m.bundle_id||receipt?.bytes_sha256!==m.bytes_sha256||receipt?.destination!==m.destination||receipt.simulation_only!==true)throw Error('ack_claim_mismatch');
  const copy={...receipt};delete copy.proof;
  if(!equal(receipt.proof,hmac(key,JSON.stringify(copy))))throw Error('ack_authentication_failed');
  return true;
}
export function simulateAuthorizedContact({bundle,key,root,consent_ref,identity_verified=false,link_observed=false,max_fragments=0}){
  keyOK(key);const m=verifyManifest(bundle,key);
  if(!consent_ref||!identity_verified||!link_observed)return {state:'NO_ROUTE',reason:'unverified_or_unconsented_gateway',simulation_only:true,ack:null};
  if(!Number.isInteger(max_fragments)||max_fragments<=0||max_fragments>2048)throw Error('invalid_contact_budget');
  const dir=gatewayFolder(root,m.bundle_id);
  // Detect corruption and unsafe files before any new writes, including a prior partial window.
  for(let i=0;i<m.fragment_count;i++){
    const f=path.join(dir,`fragment-${i}.dat`);
    if(fs.existsSync(f)){
      const st=fs.lstatSync(f);if(!st.isFile()||(st.mode&0o077)||!fs.readFileSync(f).equals(Buffer.from(bundle.fragments[i],'base64')))throw Error('conflicting_fragment');
    }
  }
  let transferred=0;
  for(let i=0;i<m.fragment_count&&transferred<max_fragments;i++){
    const f=path.join(dir,`fragment-${i}.dat`);
    if(!fs.existsSync(f)){storeFile(f,Buffer.from(bundle.fragments[i],'base64'));transferred++;}
  }
  const reconstructed=rebuild(bundle,dir);
  const stored=fs.readdirSync(dir).filter(f=>/^fragment-\d+\.dat$/.test(f)).length;
  return {state:reconstructed?'CUSTODY_ACCEPTED':'PARTIAL',simulation_only:true,fragment_count:m.fragment_count,stored_fragments:stored,transferred_fragments:transferred,ack:reconstructed?ack(key,'gateway_custody',m):null};
}
export function simulateDestinationDelivery({bundle,key,gateway_root,destination_root,expected_destination}) {
  keyOK(key);const m=verifyManifest(bundle,key);
  if(m.destination!==expected_destination)throw Error('destination_not_authorized');
  const bytes=rebuild(bundle,gatewayFolder(gateway_root,m.bundle_id));
  if(!bytes)return {state:'HOLD_MISSING_FRAGMENTS',simulation_only:true,ack:null};
  const envelope=JSON.parse(bytes.toString('utf8'));
  if(envelope.source!==m.source||envelope.destination!==m.destination||envelope.message_id!==m.bundle_id)throw Error('envelope_manifest_mismatch');
  const opened=openEnvelope({envelope,key,expected_destination});
  const root=safeRoot(destination_root),file=path.join(root,`${m.bundle_id}.json`);
  const stored={message_id:m.bundle_id,from:m.source,payload:opened.payload};
  const fresh=storeFile(file,Buffer.from(JSON.stringify(stored)));
  return {state:'END_TO_END_DELIVERED',simulation_only:true,duplicate:!fresh,ack:ack(key,'destination_delivery',m)};
}
