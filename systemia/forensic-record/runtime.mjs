import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ingestForensicRecords,
  searchForensicFindings,
  forensicCorpusHealth,
  getForensicRecord
} from './corpus-store.mjs';

const clean=(v)=>String(v??'').trim();
async function readJson(req,maxBytes=64*1024*1024){
  const chunks=[]; let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
function send(res,status,body,headers={}){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json',
    'content-length':bytes.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...headers,
  });
  res.end(bytes);
}
function sendPublic(res,status,body){
  return send(res,status,body,{
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'content-type',
    'cache-control':status===200?'public, max-age=30':'no-store',
  });
}
function unauthorized(res,error){ return send(res,401,{ok:false,error}); }
function publicFinding(record){
  return {
    finding_number:Number.isFinite(Number(record?.finding_number))?Number(record.finding_number):null,
    title:clean(record?.title),
    source_document:clean(record?.source_document)||null,
    page_reference:clean(record?.page_reference)||null,
    source_url:clean(record?.source_url)||null,
    truth_label:clean(record?.truth_label)||null,
    quote:clean(record?.quote)||null,
    significance:clean(record?.significance)||null,
    category:clean(record?.category)||null,
    evidence_boundary:clean(record?.evidence_boundary)||'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.',
  };
}
function seedStatus(root){
  const file=path.join(root,'seed-receipt.json');
  if(!fs.existsSync(file)) return {
    seed_receipt_present:false,
    seed_complete:false,
    seed_source_manifest_sha256:null,
    seed_finding_rows:null,
    seed_protected_entities_imported:null,
  };
  try{
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    if(receipt?.schema!=='evercraft.forensic-record.owned-seed-receipt.v1') throw new Error('schema');
    return {
      seed_receipt_present:true,
      seed_complete:receipt.complete===true,
      seed_source_manifest_sha256:clean(receipt.source_manifest_sha256)||null,
      seed_finding_rows:Number.isFinite(Number(receipt?.corpus_health?.finding_rows))
        ? Number(receipt.corpus_health.finding_rows)
        : null,
      seed_protected_entities_imported:receipt.protected_entities_imported===true,
    };
  }catch{
    return {
      seed_receipt_present:true,
      seed_complete:false,
      seed_source_manifest_sha256:null,
      seed_finding_rows:null,
      seed_protected_entities_imported:null,
    };
  }
}

export async function startForensicRecordRuntime({
  stateDir,
  host='127.0.0.1',
  port=0,
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY||'',
  ingestToken=process.env.FORENSIC_RECORD_INGEST_TOKEN||''
}={}){
  if(!stateDir) throw new Error('forensic_state_dir_required');
  if(!clean(systemiaMachineKey)) throw new Error('SYSTEMIA_MACHINE_KEY is required');
  if(!clean(ingestToken)) throw new Error('FORENSIC_RECORD_INGEST_TOKEN is required');
  const root=path.resolve(stateDir);
  fs.mkdirSync(root,{recursive:true,mode:0o750});
  const instanceId='forensic_'+randomBytes(12).toString('hex');
  const startedAt=new Date().toISOString();
  let deploymentReceiptRef='';
  let server=null;
  const health=()=>({
    ...forensicCorpusHealth({stateDir:root}),
    ...seedStatus(root),
    service:'forensic-record-owned-runtime',
    runtime:'Evercraft Compute',
    instance_id:instanceId,
    private_source_runtime:true,
    public_edge_separate:true,
    public_read_only_api:true,
    public_write_api:false,
    public_search_path:'/v1/public/search',
    public_finding_path_template:'/v1/public/findings/{finding_number}',
    public_meta_path:'/v1/public/meta',
    protected_ingest_requires_auth:true,
    protected_systemia_search_requires_machine_key:true,
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    started_at:startedAt
  });

  server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/health') return send(res,200,health());

      if(req.method==='OPTIONS'&&url.pathname.startsWith('/v1/public/')){
        return sendPublic(res,204,{});
      }

      if(req.method==='GET'&&url.pathname==='/v1/public/meta'){
        const state=health();
        return sendPublic(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-meta.v1',
          canonical_url:'https://filescompanion.com/',
          finding_rows:state.finding_rows,
          unique_finding_numbers:state.unique_finding_numbers,
          duplicate_number_keys:state.duplicate_number_keys,
          duplicate_number_extra_rows:state.duplicate_number_extra_rows,
          missing_page_reference:state.missing_page_reference,
          missing_source_url:state.missing_source_url,
          canonical_source_documents:state.canonical_source_documents,
          seed_complete:state.seed_complete===true,
          evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.',
          updated_at:state.updated_at,
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/public/search'){
        const text=clean(url.searchParams.get('q'));
        const sourceDocument=clean(url.searchParams.get('source_document'));
        const findingRaw=clean(url.searchParams.get('finding_number'));
        if(text.length>200) return sendPublic(res,400,{ok:false,error:'query_too_long'});
        if(sourceDocument.length>300) return sendPublic(res,400,{ok:false,error:'source_document_too_long'});
        let findingNumber=null;
        if(findingRaw){
          findingNumber=Number(findingRaw);
          if(!Number.isInteger(findingNumber)||findingNumber<=0){
            return sendPublic(res,400,{ok:false,error:'finding_number_invalid'});
          }
        }
        const requestedLimit=Number(url.searchParams.get('limit')||20);
        const limit=Number.isFinite(requestedLimit)
          ? Math.max(1,Math.min(50,Math.floor(requestedLimit)))
          : 20;
        const result=searchForensicFindings({
          stateDir:root,
          findingNumber,
          sourceDocument,
          text,
          limit,
        });
        return sendPublic(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-search.v1',
          query:{q:text||null,finding_number:findingNumber,source_document:sourceDocument||null,limit},
          count:result.count,
          results:result.results.map(publicFinding),
          evidence_boundary:'Search results show source-linked archive records. A mention, association, allegation, or testimony is not by itself an adjudicated fact.',
        });
      }

      const publicFindingMatch=url.pathname.match(/^\/v1\/public\/findings\/(\d+)$/);
      if(req.method==='GET'&&publicFindingMatch){
        const findingNumber=Number(publicFindingMatch[1]);
        if(!Number.isInteger(findingNumber)||findingNumber<=0){
          return sendPublic(res,400,{ok:false,error:'finding_number_invalid'});
        }
        const result=searchForensicFindings({stateDir:root,findingNumber,limit:50});
        if(!result.count) return sendPublic(res,404,{ok:false,error:'finding_not_found'});
        return sendPublic(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-finding.v1',
          finding_number:findingNumber,
          variant_count:result.count,
          findings:result.results.map(publicFinding),
          duplicate_number_preserved:result.count>1,
          evidence_boundary:'Finding-number collisions are preserved rather than silently deleted. Each returned row must be evaluated against its cited source and epistemic label.',
        });
      }

      if(req.method==='POST'&&url.pathname==='/v1/ingest'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return unauthorized(res,'ingest_authorization_required');
        const body=await readJson(req);
        const receipt=ingestForensicRecords({
          stateDir:root,
          domain:body.domain,
          records:Array.isArray(body.records)?body.records:[],
          source:body.source||{}
        });
        return send(res,201,receipt);
      }

      if(req.method==='POST'&&url.pathname==='/v1/search'){
        if(clean(req.headers['x-systemia-machine-key'])!==systemiaMachineKey) return unauthorized(res,'systemia_machine_authorization_required');
        const body=await readJson(req,1024*1024);
        const result=searchForensicFindings({
          stateDir:root,
          findingNumber:body.finding_number,
          sourceDocument:body.source_document,
          text:body.text,
          limit:body.limit
        });
        return send(res,200,{ok:true,...result});
      }

      if(req.method==='GET'&&url.pathname.startsWith('/v1/records/')){
        if(clean(req.headers['x-systemia-machine-key'])!==systemiaMachineKey) return unauthorized(res,'systemia_machine_authorization_required');
        const recordKey=decodeURIComponent(url.pathname.slice('/v1/records/'.length));
        const found=getForensicRecord({stateDir:root,recordKey});
        return found?send(res,200,{ok:true,...found}):send(res,404,{ok:false,error:'record_not_found'});
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      return send(res,500,{ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });

  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const addr=server.address();
  const actualPort=typeof addr==='object'&&addr?addr.port:port;
  return {
    schema:'evercraft.forensic-record.owned-runtime.v1',
    service:'forensic-record-owned-runtime',
    instance_id:instanceId,
    service_url:'http://'+host+':'+actualPort,
    health_path:'/health',
    health,
    setDeploymentReceipt:(receiptRef)=>{
      deploymentReceiptRef=clean(receiptRef);
      return health();
    },
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
  };
}
