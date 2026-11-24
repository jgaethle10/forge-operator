// Scoped one-time migration over an already authenticated, confidential job route.
// No new listener, no master key export. The trusted resident must supply sendJob
// bound to the exact admitted Node002 restore workload, not a public gateway.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const NODE='evercraft-node002-nextgen';
const WORKLOAD='systemia.evermaps-cemetery-restore.v1';
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
export async function transferCemeterySnapshot({snapshot,sendJob,authorizedNode,confidentialRouteVerified=false,sourceWriterFrozen=false}={}){
 if(authorizedNode!==NODE||confidentialRouteVerified!==true||sourceWriterFrozen!==true||typeof sendJob!=='function')throw Error('cemetery_transfer_authority_required');
 if(!path.isAbsolute(snapshot)||path.basename(snapshot)!=='va-gravesite-canary.sqlite3')throw Error('cemetery_transfer_scope_denied');
 const st=fs.lstatSync(snapshot);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>1024*1024||st.size<100)throw Error('cemetery_snapshot_invalid');
 const body=fs.readFileSync(snapshot),digest=sha(body);
 const chunks=[];
 for(let i=0;i<body.length;i+=24*1024)chunks.push(body.subarray(i,i+24*1024));
 const manifest={schema:'evercraft.cemetery.migration.v1',object_sha256:digest,byte_count:body.length,chunk_count:chunks.length};
 for(let i=0;i<chunks.length;i++){
  const chunk=chunks[i],chunk_digest=sha(chunk);
  const result=await sendJob({node_id:NODE,workload_class:WORKLOAD,idempotency_key:digest.slice(7)+':'+i,payload:{operation:'stage_chunk',manifest,index:i,chunk_sha256:chunk_digest,bytes_base64:chunk.toString('base64')}});
  if(result?.node_id!==NODE||result?.object_sha256!==digest||result?.chunk_sha256!==chunk_digest||result?.index!==i||result?.stored!==true)throw Error('cemetery_chunk_receipt_unverified');
 }
 const result=await sendJob({node_id:NODE,workload_class:WORKLOAD,idempotency_key:digest.slice(7)+':restore',payload:{operation:'restore',manifest}});
 if(result?.node_id!==NODE||result?.object_sha256!==digest||result?.sqlite_integrity_verified!==true||result?.destination_installed!==true||result?.records!==250||result?.cursor!==1216)throw Error('cemetery_restore_receipt_unverified');
 return {...result,source_writer_frozen:true,writer_handoff_complete:false};
}
