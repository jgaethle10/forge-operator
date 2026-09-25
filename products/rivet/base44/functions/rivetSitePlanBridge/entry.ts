import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ALIEV_APP_ID='69b9b64d86a732029ce0db81';
const ALIEV_GRANT_URL=`https://base44.app/api/apps/${ALIEV_APP_ID}/functions/rivetSitePlanReviewGrant`;
const clean=(v:any)=>String(v??'').trim();
const noStore={'Cache-Control':'no-store, max-age=0'};
const respond=(body:any,status=200)=>Response.json(body,{status,headers:noStore});

async function sha256HexBytes(bytes:Uint8Array){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function sha256HexText(value:string){
  return sha256HexBytes(new TextEncoder().encode(value));
}
function base64ToBytes(value:string){
  const raw=atob(value);
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function hexToBytes(value:string){
  const hex=clean(value).replace(/^hex:/,'');
  if(!hex||hex.length%2)throw new Error('malformed_hex_transport');
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++){
    const n=Number.parseInt(hex.slice(i*2,i*2+2),16);
    if(!Number.isFinite(n))throw new Error('malformed_hex_transport');
    out[i]=n;
  }
  return out;
}
function bytesToBase64(bytes:Uint8Array){
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000){
    const part=bytes.subarray(i,Math.min(bytes.length,i+0x8000));
    binary+=String.fromCharCode(...part);
  }
  return btoa(binary);
}
async function callAliEV(payload:any){
  const r=await fetch(ALIEV_GRANT_URL,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(payload),
  });
  const text=await r.text();
  let data:any=null;
  try{data=text?JSON.parse(text):null}catch{data={ok:false,error:'aliev_non_json_response'};}
  if(!r.ok||!data?.ok){
    const err=new Error(clean(data?.error)||`aliev_bridge_http_${r.status}`);
    (err as any).status=r.status||502;
    throw err;
  }
  return data;
}
async function resolveBytes(token:string,resolved:any){
  const transport=clean(resolved?.asset?.transport);
  if(transport==='inline_base64')return base64ToBytes(clean(resolved.asset.inline_base64));
  if(transport==='chunked_base64'){
    const total=Math.max(0,Number(resolved?.asset?.total_chunks||0));
    if(!total)throw new Error('aliev_chunk_count_missing');
    const chunks:any[]=[];
    for(let start=0;start<total;start+=12){
      const batch=await callAliEV({action:'chunk_batch',token,start,limit:12});
      for(const row of batch.chunks||[])chunks.push(row);
    }
    chunks.sort((a,b)=>Number(a.chunk_index)-Number(b.chunk_index));
    if(chunks.length!==total)throw new Error(`aliev_chunk_transport_incomplete:${chunks.length}/${total}`);
    const payload=chunks.map(x=>String(x.data_base64||'')).join('');
    return payload.startsWith('hex:')?hexToBytes(payload):base64ToBytes(payload);
  }
  if(transport==='public_asset'){
    const origin=clean(resolved?.asset?.source_origin);
    const path=clean(resolved?.asset?.public_path);
    const encoding=clean(resolved?.asset?.public_encoding);
    if(!/^https:\/\/[a-z0-9.-]+$/i.test(origin)||!path.startsWith('/'))throw new Error('public_asset_origin_invalid');
    const u=new URL(path,origin);
    if(u.origin!==origin)throw new Error('public_asset_cross_origin_rejected');
    const r=await fetch(u.toString(),{headers:{accept:'text/plain,*/*'}});
    if(!r.ok)throw new Error(`public_asset_fetch_failed:${r.status}`);
    const payload=(await r.text()).trim();
    return encoding==='hex'?hexToBytes(payload):base64ToBytes(payload);
  }
  throw new Error(`unsupported_aliev_transport:${transport||'unknown'}`);
}
async function ownerUser(base44:any){
  const me:any=await base44.auth.me().catch(()=>null);
  if(!me?.id)return null;
  if(me.role==='admin'||me.rivet_owner===true)return me;
  return null;
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return respond({ok:false,error:'POST required'},405);
    const body=await req.json().catch(()=>({}));
    const action=clean(body.action||'list');
    const base44=createClientFromRequest(req);
    const sr:any=base44.asServiceRole;

    if(action==='import'){
      const token=clean(body.token);
      if(token.length<32||token.length>256)return respond({ok:false,error:'invalid_handoff_token'},400);
      const resolved=await callAliEV({action:'resolve',token});
      if(resolved?.asset?.qa_state!=='passed')return respond({ok:false,error:'site_plan_not_qa_passed'},409);
      if(['needs_revision','superseded'].includes(clean(resolved?.asset?.review_state)))return respond({ok:false,error:'site_plan_not_importable'},409);

      const sourceSha=clean(resolved.asset.source_sha256).toLowerCase();
      const sourceAssetKey=clean(resolved.asset.asset_key);
      const existing=(await sr.entities.RIVETSitePlanArtifact.filter({source_asset_key:sourceAssetKey,source_sha256:sourceSha},'-imported_at',5).catch(()=>[]))?.find((x:any)=>x.artifact_state==='ready');
      if(existing)return respond({ok:true,state:'already_imported',artifact:existing});

      const bytes=await resolveBytes(token,resolved);
      const actualSha=await sha256HexBytes(bytes);
      if(!sourceSha||actualSha!==sourceSha)return respond({ok:false,error:'site_plan_hash_mismatch',expected:sourceSha.slice(0,12),actual:actualSha.slice(0,12)},409);

      const now=new Date().toISOString();
      const artifactKey=`rivet-siteplan:${sourceSha}`;
      let artifact=(await sr.entities.RIVETSitePlanArtifact.filter({artifact_key:artifactKey},'-imported_at',2).catch(()=>[]))?.[0]||null;
      const me:any=await base44.auth.me().catch(()=>null);
      const tokenHash=await sha256HexText(token);
      const metadata={
        artifact_key:artifactKey,
        source_system:'AliEV',
        source_app_id:ALIEV_APP_ID,
        source_asset_key:sourceAssetKey,
        source_package_key:clean(resolved?.site?.package_key||resolved?.asset?.package_key),
        site_id:clean(resolved?.site?.site_id),
        address:clean(resolved?.site?.address),
        city:clean(resolved?.site?.city),
        state:clean(resolved?.site?.state),
        postal_code:clean(resolved?.site?.postal_code),
        revision:clean(resolved?.site?.revision),
        evidence_status:clean(resolved?.site?.evidence_status),
        title:clean(resolved?.asset?.title)||'RIVET Site Plan',
        filename:clean(resolved?.asset?.filename)||`${clean(resolved?.site?.site_id)||'site-plan'}.bin`,
        mime_type:clean(resolved?.asset?.mime_type)||'application/octet-stream',
        source_sha256:sourceSha,
        geometry_sha256:clean(resolved?.asset?.geometry_sha256),
        renderer_revision:clean(resolved?.asset?.renderer_revision),
        qa_state:clean(resolved?.asset?.qa_state),
        review_state:clean(resolved?.asset?.review_state),
        sales_state:clean(resolved?.asset?.sales_state),
        artifact_state:'importing',
        chunk_count:0,
        byte_count:bytes.length,
        imported_at:artifact?.imported_at||now,
        updated_at:now,
        imported_by_email:clean(me?.email)||'AliEV handoff',
        source_grant_sha256:tokenHash,
        customer_visible:false,
        notes:'Exact hash-bound site plan imported from AliEV for the RIVET internal team scope. Import does not authorize customer delivery.'
      };
      if(artifact)await sr.entities.RIVETSitePlanArtifact.update(artifact.id,metadata);
      else artifact=await sr.entities.RIVETSitePlanArtifact.create(metadata);

      const oldChunks=await sr.entities.RIVETSitePlanChunk.filter({artifact_key:artifactKey},'chunk_index',500).catch(()=>[]);
      for(const row of oldChunks||[])if(row?.id)await sr.entities.RIVETSitePlanChunk.delete(row.id).catch(()=>null);

      const byteChunkSize=Math.max(7000,Math.ceil(bytes.length/480));
      const totalChunks=Math.ceil(bytes.length/byteChunkSize);
      for(let i=0;i<totalChunks;i++){
        const part=bytes.subarray(i*byteChunkSize,Math.min(bytes.length,(i+1)*byteChunkSize));
        await sr.entities.RIVETSitePlanChunk.create({
          artifact_key:artifactKey,
          chunk_index:i,
          total_chunks:totalChunks,
          data_base64:bytesToBase64(part),
          created_at:now
        });
      }
      await sr.entities.RIVETSitePlanArtifact.update(artifact.id,{artifact_state:'ready',chunk_count:totalChunks,byte_count:bytes.length,updated_at:new Date().toISOString()});
      const ready=(await sr.entities.RIVETSitePlanArtifact.filter({artifact_key:artifactKey},'-updated_at',2).catch(()=>[]))?.[0]||artifact;
      return respond({ok:true,state:'imported',artifact:ready});
    }

    const me=await ownerUser(base44);
    if(!me)return respond({ok:false,error:'rivet_owner_required'},403);

    if(action==='list'){
      const rows=await sr.entities.RIVETSitePlanArtifact.list('-imported_at',100).catch(()=>[]);
      return respond({ok:true,artifacts:(rows||[]).filter((x:any)=>x.customer_visible!==true)});
    }
    if(action==='get'){
      const artifactKey=clean(body.artifact_key);
      if(!artifactKey)return respond({ok:false,error:'artifact_key_required'},400);
      const artifact=(await sr.entities.RIVETSitePlanArtifact.filter({artifact_key:artifactKey},'-updated_at',2).catch(()=>[]))?.[0]||null;
      if(!artifact||artifact.artifact_state!=='ready')return respond({ok:false,error:'site_plan_not_ready'},404);
      const chunks=(await sr.entities.RIVETSitePlanChunk.filter({artifact_key:artifactKey},'chunk_index',500).catch(()=>[])).sort((a:any,b:any)=>Number(a.chunk_index)-Number(b.chunk_index));
      if(!chunks.length||chunks.length!==Number(artifact.chunk_count||0))return respond({ok:false,error:'site_plan_chunks_incomplete'},409);
      return respond({ok:true,artifact,chunks:chunks.map((x:any)=>({chunk_index:x.chunk_index,total_chunks:x.total_chunks,data_base64:x.data_base64}))});
    }
    return respond({ok:false,error:'unsupported_action'},400);
  }catch(error){
    const status=Number((error as any)?.status||500);
    return respond({ok:false,error:error instanceof Error?error.message:String(error)},status>=400&&status<600?status:500);
  }
});