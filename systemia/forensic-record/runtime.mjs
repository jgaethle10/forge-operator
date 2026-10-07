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
function send(res,status,body){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json','content-length':bytes.length,'cache-control':'no-store'});
  res.end(bytes);
}
function unauthorized(res,error){ return send(res,401,{ok:false,error}); }
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
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    started_at:startedAt
  });

  server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/health') return send(res,200,health());

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
