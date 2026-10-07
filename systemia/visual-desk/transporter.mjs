#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVisualStory } from './factory.mjs';

const clean=(value)=>String(value ?? '').trim();

export function visualStoryTransportDigest(story){
  return normalizeVisualStory(story).digest;
}

export function buildVisualTransportEnvelope({
  story,
  row={},
  source='systemia-radar',
}={}){
  const digest=visualStoryTransportDigest(story);
  const expected=clean(row.story_sha256);
  if(expected && expected!==digest) throw new Error('visual_transport_story_digest_mismatch');
  return {
    schema:'evercraft.visual-desk.transport-envelope.v1',
    source:clean(source)||'systemia-radar',
    source_edition_id:clean(row.source_edition_id)||null,
    candidate_id:clean(row.candidate_id)||null,
    source_signal_id:clean(row.source_signal_id)||null,
    source_observation_id:clean(row.source_observation_id)||null,
    story_sha256:digest,
    story,
    publicationAuthority:false,
  };
}

function transportEndpoint(value){
  const url=new URL(clean(value));
  const host=url.hostname.toLowerCase();
  const loopback=['127.0.0.1','localhost','::1'].includes(host);
  if(url.protocol!=='https:' && !(url.protocol==='http:'&&loopback)){
    throw new Error('visual_transport_endpoint_requires_https_or_loopback');
  }
  return url;
}

function safeOutboxFile(root,file){
  const name=clean(file);
  if(!name||path.basename(name)!==name||!name.endsWith('.json')){
    throw new Error('visual_transport_outbox_file_invalid');
  }
  const target=path.resolve(root,name);
  const prefix=path.resolve(root)+path.sep;
  if(!target.startsWith(prefix)) throw new Error('visual_transport_outbox_file_escape');
  return target;
}

async function fetchWithTimeout(fetchImpl,url,options,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetchImpl(url,{...options,signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

export async function transportVisualOutbox({
  indexPath,
  endpoint,
  token,
  fetchImpl=globalThis.fetch,
  timeoutMs=15000,
  source='systemia-radar',
}={}){
  if(typeof fetchImpl!=='function') throw new Error('visual_transport_fetch_unavailable');
  const auth=clean(token);
  if(auth.length<32) throw new Error('visual_transport_token_missing_or_short');
  const target=transportEndpoint(endpoint);
  const indexFile=path.resolve(clean(indexPath));
  if(!fs.existsSync(indexFile)) throw new Error('visual_transport_index_missing');
  const index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
  if(index?.schema!=='evercraft.visual-desk.radar-outbox-index.v1'){
    throw new Error('visual_transport_index_schema_invalid');
  }
  if(index.publicationAuthority!==false){
    throw new Error('visual_transport_publication_authority_invalid');
  }

  const root=path.dirname(indexFile);
  const results=[];
  for(const row of index.stories||[]){
    try{
      const storyFile=safeOutboxFile(root,row.file);
      const story=JSON.parse(fs.readFileSync(storyFile,'utf8'));
      const envelope=buildVisualTransportEnvelope({story,row,source});
      const response=await fetchWithTimeout(fetchImpl,target,{
        method:'POST',
        headers:{
          authorization:'Bearer '+auth,
          'content-type':'application/json',
          accept:'application/json',
          'user-agent':'Evercraft-Visual-Desk-Transporter/1.0',
          'x-evercraft-idempotency-key':envelope.story_sha256,
        },
        body:JSON.stringify(envelope),
      },timeoutMs);
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.ok!==true){
        results.push({
          slug:story.slug,
          status:'failed',
          http_status:response.status,
          error:clean(body?.error)||'visual_transport_ingest_failed',
          story_sha256:envelope.story_sha256,
        });
        continue;
      }
      results.push({
        slug:story.slug,
        status:clean(body.status)||'materialized',
        http_status:response.status,
        canonical_url:body.canonical_url||null,
        story_sha256:envelope.story_sha256,
        receipt_id:body.receipt_id||null,
      });
    }catch(error){
      results.push({
        slug:clean(row.slug)||null,
        status:'failed',
        http_status:null,
        error:error instanceof Error?error.message:String(error),
        story_sha256:clean(row.story_sha256)||null,
      });
    }
  }

  const failed=results.filter((row)=>row.status==='failed');
  return {
    schema:'evercraft.visual-desk.transport-receipt.v1',
    source_edition_id:index.source_edition_id||null,
    endpoint:target.origin+target.pathname,
    attempted:results.length,
    delivered:results.length-failed.length,
    failed:failed.length,
    status:failed.length?'partial':'pass',
    results,
    publicationAuthority:false,
    external_social_publish_performed:false,
    observed_at:new Date().toISOString(),
  };
}

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const indexPath=arg('--index');
  const endpoint=arg('--endpoint',process.env.EVERCRAFT_VISUAL_INGEST_URL||'');
  const tokenFile=arg('--token-file',process.env.EVERCRAFT_VISUAL_INGEST_TOKEN_FILE||'');
  const receiptFile=arg('--receipt','');
  if(!indexPath||!endpoint||!tokenFile){
    console.error('usage: node systemia/visual-desk/transporter.mjs --index <index.json> --endpoint <url> --token-file <secret-file> [--receipt <receipt.json>]');
    process.exit(2);
  }
  const token=fs.readFileSync(path.resolve(tokenFile),'utf8').trim();
  const receipt=await transportVisualOutbox({indexPath,endpoint,token});
  if(receiptFile){
    fs.mkdirSync(path.dirname(path.resolve(receiptFile)),{recursive:true});
    fs.writeFileSync(path.resolve(receiptFile),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  }
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  if(receipt.status!=='pass') process.exitCode=1;
}
