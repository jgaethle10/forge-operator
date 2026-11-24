// Bounded snapshot transport using the EXISTING ambient memory Fabric.
// Storage placement only: this does not grant destination restore authority.
// The trusted resident supplies attested offers and gateway credentials.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {storeAmbientMemoryObject,readAmbientMemoryObject} from './ambient-memory-fabric.mjs';
const MAX=1024*1024;
const TARGET='evercraft-node002-nextgen';
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
export async function stageCemeterySnapshot({snapshot,offers,stateDir,gatewayUrl,gatewayToken,now=new Date()}={}){
 if(!snapshot||!path.isAbsolute(snapshot)||path.basename(snapshot)!=='va-gravesite-canary.sqlite3')throw Error('snapshot_scope_denied');
 const stat=fs.lstatSync(snapshot);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.size<100||stat.size>MAX)throw Error('snapshot_private_size_required');
 const bytes=fs.readFileSync(snapshot);
 if(bytes.subarray(0,16).toString('ascii')!=='SQLite format 3\0')throw Error('snapshot_sqlite_header_invalid');
 const targetOffers=(offers||[]).filter(o=>o.device_id===TARGET);
 if(!targetOffers.length)throw Error('snapshot_nextgen_offer_required');
 const args={stateDir,gatewayUrl,gatewayToken};
 const manifest=await storeAmbientMemoryObject({...args,bytes,offers:targetOffers,replication:1,now});
 if(manifest.object_sha256!==digest(bytes)||manifest.plaintext_bytes!==bytes.length||
 !manifest.chunks?.length||manifest.chunks.some(c=>c.replicas?.length!==1||c.replicas[0].device_id!==TARGET))throw Error('snapshot_destination_not_verified');
 const restored=await readAmbientMemoryObject({...args,object_sha256:manifest.object_sha256});
 if(restored.object_integrity_verified!==true||!restored.bytes.equals(bytes))throw Error('snapshot_roundtrip_failed');
 return {schema:'evercraft.fabric.cemetery-snapshot-stage.v1',target_node:TARGET,object_sha256:manifest.object_sha256,byte_count:bytes.length,chunk_count:manifest.chunk_count,encrypted_storage_roundtrip_verified:true,destination_plaintext_installed:false,writer_handoff_complete:false};
}
