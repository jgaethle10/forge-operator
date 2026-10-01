#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const clean=(v)=>String(v??'').trim();
const readJson=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const sha=(v)=>'sha256:'+crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');

export async function probeCapabilityCandidates({
  links,
  fetchImpl=fetch,
  timeoutMs=12000,
  now=new Date()
}={}){
  const rows=[];
  for(const link of links?.links||[]){
    if(clean(link?.implementation_state)!=='source_implemented_live_verification_pending') continue;
    const endpoint=clean(link?.candidate_endpoint);
    const probe=link?.verification_probe;
    if(!endpoint||!probe?.body||clean(probe?.method||'POST').toUpperCase()!=='POST'){
      rows.push({
        product_key:clean(link?.product_key),
        state:'probe_contract_missing',
        live_verified:false,
        endpoint:endpoint||null
      });
      continue;
    }

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const started=Date.now();
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'accept':'application/json',
          'user-agent':'Evercraft-Capability-Candidate-Probe/1.0'
        },
        body:JSON.stringify(probe.body),
        redirect:'follow',
        signal:controller.signal
      });
      const text=await response.text();
      let payload=null;
      try{payload=JSON.parse(text);}catch{}
      const expectedSchema=clean(probe.expected_schema);
      const schemaOk=!expectedSchema||clean(payload?.schema)===expectedSchema;
      const verified=Boolean(response.ok&&payload?.ok===true&&schemaOk);
      rows.push({
        product_key:clean(link?.product_key),
        machine_public_id:clean(link?.machine_public_id)||null,
        endpoint,
        source_checkpoint:clean(link?.source_checkpoint)||null,
        state:verified?'live_probe_verified':'pending_live_verification',
        live_verified:verified,
        http_status:response.status,
        response_schema:clean(payload?.schema)||null,
        expected_schema:expectedSchema||null,
        schema_verified:schemaOk,
        response_digest:sha(text),
        elapsed_ms:Date.now()-started,
        error:verified?null:clean(payload?.error||(!response.ok?'http_'+response.status:'probe_contract_mismatch'),500)
      });
    }catch(error){
      rows.push({
        product_key:clean(link?.product_key),
        machine_public_id:clean(link?.machine_public_id)||null,
        endpoint,
        source_checkpoint:clean(link?.source_checkpoint)||null,
        state:'pending_live_verification',
        live_verified:false,
        http_status:null,
        response_schema:null,
        expected_schema:clean(probe.expected_schema)||null,
        schema_verified:false,
        response_digest:null,
        elapsed_ms:Date.now()-started,
        error:clean(error?.name||error?.message||error,500)
      });
    }finally{
      clearTimeout(timer);
    }
  }

  const verified=rows.filter(x=>x.live_verified).length;
  return {
    schema:'evercraft.capability-candidate-live-probe.v1',
    observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
    summary:{
      candidates:rows.length,
      live_verified:verified,
      pending:rows.length-verified,
      all_verified:rows.length>0&&verified===rows.length
    },
    doctrine:{
      probe_success_is_not_publication:true,
      source_presence_is_not_live_capability:true,
      live_probe_is_not_mcp_binding:true,
      live_probe_is_not_payment_or_external_action_authority:true,
      promotion_requires_separate_conformance_and_binding:true
    },
    candidates:rows
  };
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname);
if(isCli){
  const links=readJson('systemia/saban/capability-promotion-links.json');
  const outArg=process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out')+1]
    : 'artifacts/capability-promotion/candidate-live-probe.json';
  const report=await probeCapabilityCandidates({links});
  const out=path.resolve(outArg);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
  if(process.argv.includes('--require-live')&&!report.summary.all_verified){
    process.exitCode=1;
  }
}
