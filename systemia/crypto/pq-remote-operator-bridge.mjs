/**
 * LAB ONLY: stage courier PUBLIC bundles and signed ciphertext through
 * existing authorized Evercraft Remote Operator gateways (outbound-only).
 * The gateways and control grants are supplied by Systemia/Passport;
 * this module creates no listeners, secrets, approvals or production routes.
 * Both nodes must already be authorized. Receiver still decrypts/verifies.
 */
import {createHash,createPublicKey} from 'node:crypto';
const PUBLIC_SCHEMA='systemia.crypto.pq-courier-public.lab.v1';
const PACKET_SCHEMA='systemia.crypto.pq-courier-message.lab.v1';
const SIGNED_SCHEMA='systemia.crypto.pq-signed-envelope.v1';
const ENVELOPE_SCHEMA='systemia.crypto.pq-envelope.v1';
const ALG='ML-KEM-768+HKDF-SHA256+AES-256-GCM';
const DENY='PQ Remote Operator courier bridge denied';
const readRoute='/v1/operator/fs/read',writeRoute='/v1/operator/fs/write';
const MAX=65536;
const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const fp=k=>createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
const node=v=>v==='node001'||v==='node002';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
function pair(a,b) {if(!node(a)||!node(b)||a===b) throw Error(DENY);}
function pin(keyPem,kind,id) {
  if(typeof keyPem!=='string'||keyPem.length>10000||
     !keyPem.includes('-----BEGIN PUBLIC KEY-----')||keyPem.includes('PRIVATE KEY'))
    throw Error(DENY);
  const key=createPublicKey(keyPem);
  if(key.type!=='public'||key.asymmetricKeyType!==kind||fp(key)!==id) throw Error(DENY);
}
function validPublic(content,source,expected) {
  const p=JSON.parse(content);
  if(!exact(p,['schema','node_id','recipient_public_key_pem','recipient_key_id',
    'signer_public_key_pem','sender_key_id'])||p.schema!==PUBLIC_SCHEMA||
     p.node_id!==source||!hash(expected?.recipientKeyId)||!hash(expected?.senderKeyId)||
     p.recipient_key_id!==expected.recipientKeyId||
     p.sender_key_id!==expected.senderKeyId) throw Error(DENY);
  pin(p.recipient_public_key_pem,'ml-kem-768',expected.recipientKeyId);
  pin(p.signer_public_key_pem,'ml-dsa-65',expected.senderKeyId);
}
function validCiphertext(content,source,dest,expected) {
  const packet=JSON.parse(content);
  const sm=packet?.signed_message,p=sm?.payload,e=p?.envelope,h=e?.header;
  if(!exact(packet,['schema','signed_message'])||packet.schema!==PACKET_SCHEMA||
     !exact(sm,['payload','signature'])||
     !exact(p,['schema','sender_id','sender_key_id','issued_at_ms','expires_at_ms','nonce','envelope'])||
     !exact(e,['header','ciphertext','tag'])||
     !exact(h,['schema','algorithm','context','recipient_key_id',
       'kem_ciphertext','salt','iv'])||
     p.schema!==SIGNED_SCHEMA||h.schema!==ENVELOPE_SCHEMA||
     h.algorithm!==ALG||p.sender_id!==source||
     h.context!=='systemia.lab.pq-courier.'+source+'.to.'+dest||
     !hash(expected?.recipientKeyId)||!hash(expected?.senderKeyId)||
     h.recipient_key_id!==expected.recipientKeyId||
     p.sender_key_id!==expected.senderKeyId||
     !Number.isSafeInteger(p.issued_at_ms)||!Number.isSafeInteger(p.expires_at_ms)||
     p.issued_at_ms<0||p.expires_at_ms<=p.issued_at_ms||
     p.expires_at_ms-p.issued_at_ms>300000||
     typeof p.nonce!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(p.nonce)||
     typeof sm.signature!=='string'||!/^[A-Za-z0-9_-]{300,6000}$/.test(sm.signature)||
     typeof e.ciphertext!=='string'||e.ciphertext.length>10000||
     typeof h.kem_ciphertext!=='string'||h.kem_ciphertext.length>1600)
    throw Error(DENY);
  // Shape + pinned metadata only. Signatures, plaintext and replay are
  // independently verified by the destination courier, never this bridge.
}
async function stage({sourceGateway,destinationGateway,source,dest,sourcePath,
  destPath,kind,expected,approvalRef}) {
  try {
    pair(source,dest);
    if(typeof sourceGateway?.invoke!=='function'||
       typeof destinationGateway?.invoke!=='function'||
       typeof approvalRef!=='string'||!/^[-a-zA-Z0-9:._]{8,180}$/.test(approvalRef))
      throw Error(DENY);
    const src=await sourceGateway.invoke(readRoute,{
      body:{root_key:'home',path:sourcePath,encoding:'utf8',max_bytes:MAX}
    });
    const content=src?.content;
    if(src?.ok!==true||src.path!==sourcePath||
       typeof content!=='string'||Buffer.byteLength(content)>MAX||
       src.bytes!==Buffer.byteLength(content)||src.sha256!==sha(Buffer.from(content)))
      throw Error(DENY);
    if(kind==='public') validPublic(content,source,expected);
    else validCiphertext(content,source,dest,expected);
    const wrote=await destinationGateway.invoke(writeRoute,{
      body:{root_key:'home',path:destPath,content,encoding:'utf8',
        overwrite:false,approval_ref:approvalRef}
    });
    if(wrote?.ok!==true||wrote.path!==destPath||
       wrote.bytes!==src.bytes||wrote.sha256!==src.sha256) throw Error(DENY);
    const receipt=await destinationGateway.invoke(readRoute,{
      body:{root_key:'home',path:destPath,encoding:'utf8',max_bytes:MAX}
    });
    if(receipt?.ok!==true||receipt.path!==destPath||
       receipt.content!==content||receipt.sha256!==src.sha256||
       receipt.bytes!==src.bytes) throw Error(DENY);
    return Object.freeze({
      schema:'systemia.crypto.pq-remote-operator-bridge.lab.v1',
      kind,source_node:source,destination_node:dest,
      destination_path:destPath,content_sha256:src.sha256,
      bytes:src.bytes,transport:'evercraft.remote-operator.outbound-only.v1',
      source_receipt_hash:src.receipt?.receipt_hash||null,
      destination_receipt_hash:wrote.receipt?.receipt_hash||null,
      receiver_authenticated:false,production_ready:false
    });
  }catch{throw Error(DENY);}
}
/** expectedIdentity MUST be separately observed, never learned from bundle. */
export async function bridgePqPublicBundle({
  sourceGateway,destinationGateway,sourceNode,destinationNode,
  expectedIdentity,approvalRef
}={}) {
  pair(sourceNode,destinationNode);
  return stage({sourceGateway,destinationGateway,source:sourceNode,dest:destinationNode,
    sourcePath:'evercraft-pq-courier-'+sourceNode+'/public.json',
    destPath:'evercraft-pq-inbox/'+sourceNode+'-public.json',kind:'public',
    expected:expectedIdentity,approvalRef});
}
/** messageFilename is the basename produced by the offline courier CLI. */
export async function bridgePqCiphertext({
  sourceGateway,destinationGateway,sourceNode,destinationNode,
  messageFilename,expectedIdentity,approvalRef
}={}) {
  pair(sourceNode,destinationNode);
  if(typeof messageFilename!=='string'||
     !/^message-[0-9]{12,16}-[a-f0-9]{8}\.json$/.test(messageFilename))
    throw Error(DENY);
  return stage({sourceGateway,destinationGateway,source:sourceNode,dest:destinationNode,
    sourcePath:'evercraft-pq-courier-'+sourceNode+'/'+messageFilename,
    destPath:'evercraft-pq-inbox/'+sourceNode+'-'+messageFilename,
    kind:'ciphertext',expected:expectedIdentity,approvalRef});
}
