/**
 * OFFLINE TWO-PHYSICAL-NODE LAB COURIER, NOT PRODUCTION.
 *
 * Exchanges public bundles and signed encrypted message files by a human-
 * controlled file transfer. No sockets, service restart, cloud upload, Git
 * commits, live Relay keys, or real customer messages.
 *
 * WARNING: Disposable, unencrypted PKCS8 keys are stored in a mode-0700
 * local lab directory. Keep them off synced folders, logs, and Git; delete
 * them after the rehearsal. This does NOT implement Systemia root enrollment,
 * global replay arbitration or key revocation. Manual verification of both
 * peer public-key fingerprints over a trusted separate channel is required.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePqRecipient} from './pq-envelope.mjs';
import {
  generatePqSigner,signAndEncryptPqMessage,openSignedPqMessage
} from './pq-signed-envelope.mjs';
import {createLocalSqliteReplayGuard} from './pq-replay-sqlite.mjs';

const PUBLIC_SCHEMA='systemia.crypto.pq-courier-public.lab.v1';
const MESSAGE_SCHEMA='systemia.crypto.pq-courier-message.lab.v1';
const PRIVATE_SCHEMA='systemia.crypto.pq-courier-local.lab.v1';
const DENY='PQ offline courier denied';
const labNode=id=>id==='node001'||id==='node002';
const fingerprint=key=>crypto.createHash('sha256')
  .update(key.export({type:'spki',format:'der'})).digest('hex');
const isHash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const exact=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');

function noGitParents(directory) {
  let current=directory;
  while(true) {
    if(fs.existsSync(path.join(current,'.git')))
      throw new Error('Lab secrets must be outside all Git worktrees');
    const next=path.dirname(current);
    if(next===current) return;
    current=next;
  }
}
function checkDir(directory) {
  if(typeof directory!=='string'||!path.isAbsolute(directory))
    throw new Error('An absolute isolated lab directory is required');
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory() || stat.isSymbolicLink() ||
     (stat.mode&0o077)!==0 ||
     (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
    throw new Error('Lab directory must be private, owned and not a symlink');
  noGitParents(directory);
}
function readJson(file,maxBytes=64*1024) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>maxBytes)
    throw new Error('Invalid JSON file or size');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function saveJson(file,value) {
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{
    encoding:'utf8',mode:0o600,flag:'wx'
  });
}
function publicKey(pem,type) {
  if(typeof pem!=='string'||pem.length>10000) throw new Error('Public key size invalid');
  const key=crypto.createPublicKey(pem);
  if(key.type!=='public'||key.asymmetricKeyType!==type)
    throw new Error('Unexpected public key algorithm');
  return key;
}
function publicBundleFrom(directory) {
  const p=readJson(path.join(directory,'public.json'));
  return validatePublicBundle(p);
}
function validatePublicBundle(p) {
  if(!exact(p,['schema','node_id','recipient_public_key_pem','recipient_key_id',
    'signer_public_key_pem','sender_key_id']) || p.schema!==PUBLIC_SCHEMA||
    !labNode(p.node_id)||!isHash(p.recipient_key_id)||!isHash(p.sender_key_id))
    throw new Error('Invalid public identity bundle');
  const recipient=publicKey(p.recipient_public_key_pem,'ml-kem-768');
  const signer=publicKey(p.signer_public_key_pem,'ml-dsa-65');
  if(fingerprint(recipient)!==p.recipient_key_id||
     fingerprint(signer)!==p.sender_key_id)
    throw new Error('Public key fingerprint mismatch');
  return Object.freeze({...p,recipientPublicKey:recipient,senderPublicKey:signer});
}
function localIdentity(directory) {
  checkDir(directory);
  const local=readJson(path.join(directory,'identity.json'),4096);
  if(!exact(local,['schema','node_id']) || local.schema!==PRIVATE_SCHEMA||
     !labNode(local.node_id)) throw new Error('Invalid local lab identity');
  const pub=publicBundleFrom(directory);
  if(local.node_id!==pub.node_id) throw new Error('Local/public identity mismatch');
  for(const [filename,type,keyId] of [
    ['recipient.private.pem','ml-kem-768',pub.recipient_key_id],
    ['signer.private.pem','ml-dsa-65',pub.sender_key_id]
  ]) {
    const file=path.join(directory,filename);
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0 ||
       (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
      throw new Error('Private lab key has unsafe permissions');
    const key=crypto.createPrivateKey(fs.readFileSync(file));
    if(key.type!=='private'||key.asymmetricKeyType!==type ||
       fingerprint(crypto.createPublicKey(key))!==keyId)
      throw new Error('Local lab key mismatch');
  }
  return Object.freeze({nodeId:local.node_id,pub});
}
function privateKey(directory,name) {
  return crypto.createPrivateKey(fs.readFileSync(path.join(directory,name)));
}
function route(sender,recipient) {
  if(!labNode(sender)||!labNode(recipient)||sender===recipient)
    throw new Error('Invalid lab route');
  return 'systemia.lab.pq-courier.'+sender+'.to.'+recipient;
}

/** One-time setup on a PHYSICAL node. Never reuse as a production identity. */
export function initializeCourierNode({directory,nodeId}) {
  if(!labNode(nodeId)) throw new TypeError('Only node001/node002 supported');
  if(!path.isAbsolute(directory)) throw new TypeError('Absolute lab directory required');
  noGitParents(directory);
  // Exclusive new directory prevents silently replacing an existing identity.
  fs.mkdirSync(directory,{recursive:false,mode:0o700});
  checkDir(directory);
  const recipient=generatePqRecipient(),signer=generatePqSigner();
  fs.writeFileSync(path.join(directory,'recipient.private.pem'),
    recipient.privateKey.export({type:'pkcs8',format:'pem'}),
    {mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(directory,'signer.private.pem'),
    signer.privateKey.export({type:'pkcs8',format:'pem'}),
    {mode:0o600,flag:'wx'});
  saveJson(path.join(directory,'identity.json'),{schema:PRIVATE_SCHEMA,node_id:nodeId});
  saveJson(path.join(directory,'public.json'),{
    schema:PUBLIC_SCHEMA,node_id:nodeId,
    recipient_public_key_pem:recipient.publicKey.export({type:'spki',format:'pem'}),
    recipient_key_id:recipient.recipientKeyId,
    signer_public_key_pem:signer.publicKey.export({type:'spki',format:'pem'}),
    sender_key_id:signer.senderKeyId
  });
  return {
    node_id:nodeId,
    public_file:path.join(directory,'public.json'),
    recipient_key_id:recipient.recipientKeyId,
    sender_key_id:signer.senderKeyId
  };
}

/**
 * No transfer occurs here; creates one portable signed ciphertext file.
 * Caller must independently verify recipient fingerprint first.
 */
export function sendSyntheticCourierMessage({directory,peerPublicFile,expectedRecipientKeyId}) {
  const local=localIdentity(directory);
  const peer=validatePublicBundle(readJson(peerPublicFile));
  if(peer.node_id===local.nodeId || !isHash(expectedRecipientKeyId) ||
     expectedRecipientKeyId!==peer.recipient_key_id)
    throw new Error('Recipient identity is not explicitly pinned');
  const now=Date.now();
  const message=signAndEncryptPqMessage({
    senderPrivateKey:privateKey(directory,'signer.private.pem'),
    sender:local.nodeId,recipientPublicKey:peer.recipientPublicKey,
    plaintext:'EVERCRAFT SYNTHETIC FIELD PROOF '+local.nodeId+' TO '+peer.node_id,
    context:route(local.nodeId,peer.node_id),nowMs:now,ttlSeconds:300
  });
  const output=path.join(directory,'message-'+now+'-'+crypto.randomBytes(4).toString('hex')+'.json');
  saveJson(output,{schema:MESSAGE_SCHEMA,signed_message:message});
  return {
    outgoing_file:output,to:peer.node_id,from:local.nodeId,
    recipient_key_id:peer.recipient_key_id,
    sender_key_id:local.pub.sender_key_id,
    expires_at_ms:message.payload.expires_at_ms
  };
}

/**
 * Performs signed check, route check, ML-KEM decryption and durable on-host
 * replay admission before returning SYNTHETIC plaintext.
 * Offline local SQLite replay is NOT a globally shared multi-node authority.
 */
export function receiveSyntheticCourierMessage({
  directory,peerPublicFile,expectedSenderKeyId,messageFile
}) {
  const local=localIdentity(directory);
  const peer=validatePublicBundle(readJson(peerPublicFile));
  if(peer.node_id===local.nodeId || !isHash(expectedSenderKeyId) ||
     expectedSenderKeyId!==peer.sender_key_id)
    throw new Error('Sender identity is not explicitly pinned');
  const message=readJson(messageFile);
  if(!exact(message,['schema','signed_message'])||message.schema!==MESSAGE_SCHEMA)
    throw new Error('Unknown courier message schema');
  const guard=createLocalSqliteReplayGuard({
    filePath:path.join(directory,'received-replay.sqlite'),maxEntries:1000
  });
  try {
    const result=openSignedPqMessage({
      signedMessage:message.signed_message,senderPublicKey:peer.senderPublicKey,
      expectedSender:peer.node_id,
      recipientPrivateKey:privateKey(directory,'recipient.private.pem'),
      expectedContext:route(peer.node_id,local.nodeId),replayGuard:guard
    });
    const plaintext=result.plaintext.toString('utf8');
    const expected='EVERCRAFT SYNTHETIC FIELD PROOF '+peer.node_id+' TO '+local.nodeId;
    if(plaintext!==expected) throw new Error('Non-synthetic content denied');
    return {
      accepted:true,from:peer.node_id,to:local.nodeId,
      message:plaintext, sender_key_id:result.senderKeyId,
      replay_protection:'durable-on-this-recipient-only'
    };
  } finally {
    guard.close();
  }
}
function argumentsFromCli(input) {
  if(input.length<1) throw new Error('Action required: init, send, receive');
  const action=input[0],options={};
  for(let i=1;i<input.length;i+=2){
    if(!input[i]?.startsWith('--')||!input[i+1]) throw new Error('Expected --option value pairs');
    const key=input[i].slice(2);
    if(Object.hasOwn(options,key)) throw new Error('Duplicate option');
    options[key]=input[i+1];
  }
  const specs={
    init:['node','dir'],
    send:['dir','peer','expect-recipient-key'],
    receive:['dir','peer','expect-sender-key','file']
  };
  if(!Object.hasOwn(specs,action) ||
     Object.keys(options).sort().join(',')!==specs[action].slice().sort().join(','))
    throw new Error('Unsupported action or missing/unknown options');
  return {action,options};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    process.umask(0o077);
    const {action,options}=argumentsFromCli(process.argv.slice(2));
    let result;
    if(action==='init') result=initializeCourierNode({
      directory:options.dir,nodeId:options.node
    });
    else if(action==='send') result=sendSyntheticCourierMessage({
      directory:options.dir,peerPublicFile:options.peer,
      expectedRecipientKeyId:options['expect-recipient-key']
    });
    else result=receiveSyntheticCourierMessage({
      directory:options.dir,peerPublicFile:options.peer,
      expectedSenderKeyId:options['expect-sender-key'],messageFile:options.file
    });
    process.stdout.write(JSON.stringify({
      schema:'systemia.crypto.pq-courier-cli-result.lab.v1',
      action,...result,production_ready:false
    },null,2)+'\n');
  } catch {
    // No stack traces or key material in CLI output.
    process.stderr.write(DENY+'\n');
    process.exitCode=1;
  }
}
