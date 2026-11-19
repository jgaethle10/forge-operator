#!/usr/bin/env node
// Systemia / Evercraft Network: offline evidence review, not physical-node certification.
// No network requests, no device discovery, no firewall changes, no cloud identity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';

const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const args = process.argv.slice(2);
const get = flag => { const i=args.indexOf(flag); return i<0 ? null : args[i+1] || null; };
const legalId = v => /^[a-z][a-z0-9_-]{0,39}$/i.test(v || '');
function privateFile(file, allowMissing=false) {
  if (!path.isAbsolute(file)) throw Error('absolute_path_required');
  if (!fs.existsSync(file)) {if(allowMissing)return null;throw Error('file_not_found');}
  const st=fs.lstatSync(file);
  if(!st.isFile() || (st.mode & 0o077))throw Error('unsafe_file_permissions_or_type');
  return st;
}
function privateDir(dir){
  if(!path.isAbsolute(dir))throw Error('absolute_path_required');
  const st=fs.lstatSync(dir);
  if(!st.isDirectory() || (st.mode & 0o077))throw Error('unsafe_state_directory');
}
function atomicNew(file, contents) {
  if(!path.isAbsolute(file))throw Error('absolute_output_required');
  privateDir(path.dirname(file));
  const fd=fs.openSync(file,'wx',0o600);
  try {fs.writeSync(fd,contents);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  const dfd=fs.openSync(path.dirname(file),'r');
  try{fs.fsyncSync(dfd);} finally{fs.closeSync(dfd);}
}
function readReceiptLog(state) {
  privateDir(state);
  const file=path.join(state,'receipts.jsonl');
  const st=privateFile(file);
  if(st.size>4*1024*1024)throw Error('receipt_log_too_large');
  const lines=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean);
  if(lines.length>3000)throw Error('too_many_receipts');
  let previous='GENESIS';
  const events=[];
  for(let i=0;i<lines.length;i++){
    let item;try{item=JSON.parse(lines[i]);}catch{throw Error(`bad_receipt_json_at_${i+1}`);}
    if(item.schema!=='evercraft.network.field-outage-lab.receipt.v1'||item.previous_hash!==previous)throw Error(`receipt_chain_break_at_${i+1}`);
    const {receipt_hash,...body}=item;
    if(receipt_hash!==sha(JSON.stringify(body)))throw Error(`receipt_hash_mismatch_at_${i+1}`);
    if(!Number.isFinite(Date.parse(item.at)))throw Error(`receipt_timestamp_invalid_at_${i+1}`);
    if(!/^[a-z][a-z0-9_.]{0,70}$/.test(item.event||''))throw Error(`receipt_event_invalid_at_${i+1}`);
    // No payload text, IP, hostnames, keys, or private network paths are copied.
    events.push({event:item.event,at:item.at,message_id:typeof item.message_id==='string'?item.message_id:null,envelope_hash:typeof item.envelope_hash==='string'?item.envelope_hash:null});
    previous=receipt_hash;
  }
  return {count:events.length,head_hash:previous,events};
}
const FILES=['systemia/network/field-outage-lab.mjs','systemia/network/secure-envelope.mjs','systemia/network/transport-router.mjs'];
function sourceIdentity(root){
  if(!root||!path.isAbsolute(root))throw Error('absolute_repo_required');
  const revision=execFileSync('git',['-C',root,'rev-parse','--verify','HEAD'],{encoding:'utf8',timeout:2500}).trim();
  const paths={};
  for(const f of FILES){
    const dest=path.join(root,f);
    if(!fs.statSync(dest).isFile())throw Error('source_not_regular_file');
    const raw=fs.readFileSync(dest);if(raw.length>400000)throw Error('source_size_exceeded');
    paths[f]=sha(raw);
  }
  // Record dirty status explicitly; source integrity is not inferred merely from a commit id.
  const diff=execFileSync('git',['-C',root,'status','--porcelain','--',...FILES],{encoding:'utf8',timeout:2500}).trim();
  if(diff)throw Error('network_source_files_modified_or_untracked');
  return {revision,paths};
}
function readOrGenerateIdentity(state){
  const file=path.join(state,'field-evidence-ed25519.pem');
  const existing=privateFile(file,true);
  if(!existing){
    const pair=crypto.generateKeyPairSync('ed25519');
    atomicNew(file,pair.privateKey.export({type:'pkcs8',format:'pem'}));
  }
  const privateKey=crypto.createPrivateKey(fs.readFileSync(file));
  const publicKey=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
  return {privateKey,publicKey};
}
function networkClass() {
  const nics=Object.values(os.networkInterfaces()).flat();
  return {private_ipv4_assigned_count:nics.filter(n=>n?.family==='IPv4'&&!n.internal&&(
    n.address.startsWith('10.')||n.address.startsWith('192.168.')||/^172\.(1[6-9]|2[0-9]|3[01])\./.test(n.address))).length,
    possible_virtualized_runtime:!!process.env.WSL_INTEROP || !!process.env.CROSTINI_CONTAINER || /microsoft|crostini/i.test(fs.existsSync('/proc/version')?fs.readFileSync('/proc/version','utf8'):'')};
}
function capture(){
  if(!args.includes('--acknowledge-owned-device'))throw Error('owned_device_acknowledgment_required');
  const id=get('--id'),peer=get('--peer-id'),state=get('--state'),output=get('--output');
  if(!legalId(id)||!legalId(peer)||id===peer)throw Error('two_distinct_logical_ids_required');
  privateDir(state);const source=sourceIdentity(get('--repo'));const receipt_log=readReceiptLog(state);
  const identity=readOrGenerateIdentity(state);
  const statement={schema:'evercraft.network.field-observation.v1',self_attested:true,independent_physical_witness:false,
    at:new Date().toISOString(),node_id:id,expected_peer_id:peer,source,receipt_log,
    environment:{node_version:process.version,platform:process.platform,arch:process.arch,...networkClass()},
    public_key_pem:identity.publicKey};
  const signature=crypto.sign(null,Buffer.from(JSON.stringify(statement)),identity.privateKey).toString('base64');
  atomicNew(output,JSON.stringify({...statement,signature},null,2)+'\n');
  console.log(JSON.stringify({status:'CAPTURED_SELF_ATTESTED_ONLY',node_id:id,events:receipt_log.count,source_revision:source.revision,output,independent_physical_witness:false}));
}
function loadReport(file){
  const st=privateFile(file);if(st.size>1024*1024)throw Error('report_too_large');
  const r=JSON.parse(fs.readFileSync(file,'utf8'));
  if(r.schema!=='evercraft.network.field-observation.v1'||r.self_attested!==true||r.independent_physical_witness!==false||!legalId(r.node_id)||!legalId(r.expected_peer_id))throw Error('invalid_report_schema');
  const {signature,...body}=r;
  if(!crypto.verify(null,Buffer.from(JSON.stringify(body)),r.public_key_pem,Buffer.from(signature,'base64')))throw Error('report_signature_invalid');
  if(!Array.isArray(r.receipt_log?.events)||r.receipt_log.events.length!==r.receipt_log.count)throw Error('receipt_summary_inconsistent');
  if(!r.source?.revision || FILES.some(f=>!/^[0-9a-f]{64}$/.test(r.source.paths?.[f]||'')))throw Error('source_identity_invalid');
  return r;
}
function review(){
  const a=loadReport(get('--alpha')),b=loadReport(get('--beta'));
  if(a.node_id!=='alpha'||b.node_id!=='beta'||a.expected_peer_id!=='beta'||b.expected_peer_id!=='alpha')throw Error('peer_pair_mismatch');
  if(a.public_key_pem===b.public_key_pem)throw Error('same_report_signer');
  if(a.source.revision!==b.source.revision||FILES.some(f=>a.source.paths[f]!==b.source.paths[f]))throw Error('source_mismatch');
  const av=a.receipt_log.events,bv=b.receipt_log.events;
  // Treat receipt events as a sequence of *unique* message identities, not a count
  // of log lines. Repeated events must never masquerade as independent delivery.
  const indexed = (rows,kind) => rows.map((row,i)=>({...row,i})).filter(row=>row.event===kind);
  const deliveries=indexed(av,'message.delivered');
  const receives=indexed(bv,'message.received');
  const ids=new Set(),matched=[];
  let reusedDeliveryId=false,conflictingReceive=false;
  const receivedById=new Map();
  for(const r of receives){
    if(!r.message_id || !/^[0-9a-f]{64}$/.test(r.envelope_hash||''))continue;
    if(receivedById.has(r.message_id)){
      // Receiver's normal idempotent retry is logged as duplicate_ack, not received.
      conflictingReceive=true;
    } else receivedById.set(r.message_id,r);
  }
  for(const d of deliveries){
    if(!d.message_id||!/^[0-9a-f]{64}$/.test(d.envelope_hash||''))continue;
    if(ids.has(d.message_id)){reusedDeliveryId=true;continue;}
    ids.add(d.message_id);
    const receiver=receivedById.get(d.message_id);
    if(receiver?.envelope_hash===d.envelope_hash)matched.push({sender:d,receiver});
  }
  // Ordering within each node's append-only log, not cross-host wall clocks:
  // delivery 1 -> unreachable -> delivery 2, and receiving process startup
  // before delivery 1 -> second startup -> delivery 2.
  const first=matched[0],last=matched[matched.length-1];
  const unreachableBetween=matched.length>=2 && indexed(av,'peer.unreachable').some(x=>x.i>first.sender.i&&x.i<last.sender.i);
  const starts=indexed(bv,'node.listener.ready');
  const restartBetween=matched.length>=2 && starts.some(x=>x.i<first.receiver.i) && starts.some(x=>x.i>first.receiver.i&&x.i<last.receiver.i);
  const queueBetween=matched.length>=2 && indexed(av,'message.queued').some(x=>x.message_id===last.sender.message_id&&x.i>first.sender.i&&x.i<last.sender.i);
  const ordered=matched.length>=2 && first.sender.i<last.sender.i&&first.receiver.i<last.receiver.i;
  const recovery=unreachableBetween&&restartBetween&&queueBetween&&ordered&&!reusedDeliveryId&&!conflictingReceive;
  const status=matched.length>=2&&recovery?'CROSS_NODE_SOFTWARE_EVIDENCE_RECONCILED':'HOLD_INSUFFICIENT_EVIDENCE';
  console.log(JSON.stringify({schema:'evercraft.network.field-evidence-review.v1',status,matched_encrypted_delivery_receipts:matched.length,
    receiver_listener_started_twice:starts.length>=2,receiver_restart_between_receipts:restartBetween,
    unreachable_between_deliveries:unreachableBetween,second_message_queued:queueBetween,
    distinct_delivery_ids:!reusedDeliveryId,unique_receiver_accepts:!conflictingReceive,
    recovery_sequence_valid:recovery,distinct_signing_keys:true,
    matching_code_revision:a.source.revision,self_attested:true,independent_physical_witness:false,
    upstream_outage_verified:false,distinct_physical_devices_verified:false,radio_or_satellite_verified:false}));
}
try{switch(args[0]){case 'capture':capture();break;case 'review':review();break;default:throw Error('usage: capture|review');}}catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:e.message}));process.exitCode=1;}
