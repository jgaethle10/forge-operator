import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  searchForensicFindings,
  forensicCorpusHealth,
} from './corpus-store.mjs';
import {
  forensicPublicHtml,
  forensicPublicCss,
  forensicPublicJs,
} from './public-ui.mjs';
import { loadPublicForensicCollections } from './public-collections.mjs';

const clean=(v)=>String(v??'').trim();

function seedStatus(root){
  const file=path.join(root,'seed-receipt.json');
  if(!fs.existsSync(file)) return {
    seed_receipt_present:false,
    seed_complete:false,
    seed_source_manifest_sha256:null,
    seed_protected_entities_imported:null,
  };
  try{
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    if(receipt?.schema!=='evercraft.forensic-record.owned-seed-receipt.v1') throw new Error('schema');
    return {
      seed_receipt_present:true,
      seed_complete:receipt.complete===true,
      seed_source_manifest_sha256:clean(receipt.source_manifest_sha256)||null,
      seed_protected_entities_imported:receipt.protected_entities_imported===true,
    };
  }catch{
    return {
      seed_receipt_present:true,
      seed_complete:false,
      seed_source_manifest_sha256:null,
      seed_protected_entities_imported:null,
    };
  }
}

function publicFinding(record={}){
  return {
    finding_number:Number.isFinite(Number(record.finding_number))?Number(record.finding_number):null,
    title:clean(record.title),
    source_document:clean(record.source_document)||null,
    page_reference:clean(record.page_reference)||null,
    source_url:clean(record.source_url)||null,
    truth_label:clean(record.truth_label)||null,
    quote:clean(record.quote)||null,
    significance:clean(record.significance)||null,
    category:clean(record.category)||null,
    evidence_boundary:clean(record.evidence_boundary)||null,
  };
}

async function readJson(req,maxBytes=256*1024){
  const chunks=[]; let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

function send(res,status,body,extraHeaders={}){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json',
    'content-length':bytes.length,
    'cache-control':'no-store',
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type',
    'x-content-type-options':'nosniff',
    ...extraHeaders,
  });
  res.end(bytes);
}

function sendText(res,status,body,contentType,extraHeaders={}){
  const bytes=Buffer.from(String(body??''));
  res.writeHead(status,{
    'content-type':contentType,
    'content-length':bytes.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
    ...extraHeaders,
  });
  res.end(bytes);
}

const publicPageHeaders={
  'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function safeStats(health,seed){
  return {
    schema:'evercraft.forensic-record.public-stats.v1',
    finding_rows:Number(health.finding_rows||0),
    unique_finding_numbers:Number(health.unique_finding_numbers||0),
    duplicate_number_keys:Number(health.duplicate_number_keys||0),
    duplicate_number_extra_rows:Number(health.duplicate_number_extra_rows||0),
    missing_page_reference:Number(health.missing_page_reference||0),
    missing_source_url:Number(health.missing_source_url||0),
    canonical_source_documents:Number(health.canonical_source_documents||0),
    seed_complete:seed.seed_complete===true,
    seed_source_manifest_sha256:seed.seed_source_manifest_sha256,
    base44_runtime_required:false,
  };
}

export async function startForensicRecordPublicRuntime({
  stateDir,
  host='127.0.0.1',
  port=0,
  requireSeed=true,
  maxRequestsPerMinute=240,
}={}){
  if(!stateDir) throw new Error('forensic_public_state_dir_required');
  const root=path.resolve(stateDir);
  const seed=seedStatus(root);
  const initialHealth=forensicCorpusHealth({stateDir:root});
  const publicData=loadPublicForensicCollections({stateDir:root});
  if(requireSeed){
    if(seed.seed_complete!==true) throw new Error('forensic_public_verified_seed_required');
    if(seed.seed_protected_entities_imported===true) throw new Error('forensic_public_seed_contains_protected_entities');
    if(Number(initialHealth.finding_rows||0)<1) throw new Error('forensic_public_nonempty_corpus_required');
  }

  const instanceId='forensic_public_'+randomBytes(12).toString('hex');
  const startedAt=new Date().toISOString();
  let deploymentReceiptRef='';
  let server=null;
  const windows=new Map();
  const limit=Math.max(30,Math.min(Number(maxRequestsPerMinute)||240,5000));

  function rateAllowed(req){
    const key=String(req.socket?.remoteAddress||'unknown');
    const now=Date.now();
    const current=windows.get(key);
    if(!current||now-current.started_at>=60000){
      windows.set(key,{started_at:now,count:1});
      return true;
    }
    current.count++;
    return current.count<=limit;
  }

  const health=()=>{
    const corpus=forensicCorpusHealth({stateDir:root});
    const currentSeed=seedStatus(root);
    return {
      ok:true,
      service:'forensic-record-public-runtime',
      runtime:'Evercraft Compute',
      instance_id:instanceId,
      mode:'public_read_only',
      read_only:true,
      public_safe_projection:true,
      protected_domains_exposed:false,
      write_routes_exposed:false,
      base44_runtime_required:false,
      canonical_store:corpus.canonical_store,
      finding_rows:corpus.finding_rows,
      unique_finding_numbers:corpus.unique_finding_numbers,
      duplicate_number_extra_rows:corpus.duplicate_number_extra_rows,
      seed_receipt_present:currentSeed.seed_receipt_present,
      seed_complete:currentSeed.seed_complete,
      seed_source_manifest_sha256:currentSeed.seed_source_manifest_sha256,
      seed_protected_entities_imported:currentSeed.seed_protected_entities_imported,
      deployment_receipt_bound:Boolean(deploymentReceiptRef),
      deployment_receipt_ref:deploymentReceiptRef||null,
      started_at:startedAt,
    };
  };

  server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(req.method==='OPTIONS') return send(res,204,{});
      if(req.method==='GET'&&url.pathname==='/health') return send(res,200,health());
      if(!rateAllowed(req)) return send(res,429,{ok:false,error:'rate_limited'},{'retry-after':'60'});

      if(req.method==='GET'&&url.pathname==='/'){
        return sendText(res,200,forensicPublicHtml(),'text/html; charset=utf-8',publicPageHeaders);
      }

      if(req.method==='GET'&&url.pathname==='/styles.css'){
        return sendText(res,200,forensicPublicCss(),'text/css; charset=utf-8',publicPageHeaders);
      }

      if(req.method==='GET'&&url.pathname==='/app.js'){
        return sendText(res,200,forensicPublicJs(),'application/javascript; charset=utf-8',publicPageHeaders);
      }

      if(req.method==='GET'&&url.pathname==='/api'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-api.v1',
          service:'forensic-record-public-runtime',
          mode:'read_only',
          routes:[
            'GET /health',
            'GET /v1/stats',
            'GET /v1/sources',
            'GET /v1/coverage',
            'GET /v1/document-sets',
            'GET /v1/page-index',
            'GET /v1/media',
            'GET /v1/archive-meta',
            'POST /v1/search',
            'GET /v1/findings/:number'
          ],
          evidence_boundary:'Source-linked records show what a source contains. Presence, association, allegation, testimony and adjudicated fact remain distinct.',
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/stats'){
        const corpus=forensicCorpusHealth({stateDir:root});
        return send(res,200,{
          ok:true,
          ...safeStats(corpus,seedStatus(root)),
          public_sources:publicData.counts.sources,
          public_coverage_sets:publicData.counts.coverage,
          public_page_index_rows:publicData.counts.page_index,
          public_document_sets:publicData.counts.document_sets,
          public_media_records:publicData.counts.media,
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/sources'){
        const q=clean(url.searchParams.get('q')).toLowerCase();
        const type=clean(url.searchParams.get('type')).toLowerCase();
        const rows=publicData.collections.sources.filter(row=>
          (!type||clean(row.doc_type).toLowerCase()===type) &&
          (!q||[row.title,row.publisher,row.description].map(clean).join(' ').toLowerCase().includes(q))
        );
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-sources.v1',
          count:Math.min(rows.length,200),
          matched_count:rows.length,
          truncated:rows.length>200,
          results:rows.slice(0,200),
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/coverage'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-coverage.v1',
          count:publicData.collections.coverage.length,
          results:publicData.collections.coverage,
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/document-sets'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-document-sets.v1',
          count:publicData.collections.document_sets.length,
          results:publicData.collections.document_sets,
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/page-index'){
        const corpus=clean(url.searchParams.get('corpus_id')).toLowerCase();
        const part=clean(url.searchParams.get('part_label')).toLowerCase();
        const review=clean(url.searchParams.get('review_status')).toLowerCase();
        const rows=publicData.collections.page_index.filter(row=>
          (!corpus||clean(row.corpus_id).toLowerCase()===corpus) &&
          (!part||clean(row.part_label).toLowerCase()===part) &&
          (!review||clean(row.review_status).toLowerCase()===review)
        );
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-page-index.v1',
          count:Math.min(rows.length,500),
          matched_count:rows.length,
          truncated:rows.length>500,
          results:rows.slice(0,500),
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/media'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-media.v1',
          count:publicData.collections.media.length,
          results:publicData.collections.media,
        });
      }

      if(req.method==='GET'&&url.pathname==='/v1/archive-meta'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-archive-meta.v1',
          count:publicData.collections.archive_meta.length,
          results:publicData.collections.archive_meta,
        });
      }

      const findingMatch=url.pathname.match(/^\/v1\/findings\/(\d+)$/);
      if(req.method==='GET'&&findingMatch){
        const findingNumber=Number(findingMatch[1]);
        const result=searchForensicFindings({stateDir:root,findingNumber,limit:50});
        if(!result.results.length) return send(res,404,{ok:false,error:'finding_not_found'});
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-finding-results.v1',
          finding_number:findingNumber,
          collision_count:result.results.length,
          results:result.results.map(publicFinding),
        });
      }

      if(req.method==='POST'&&url.pathname==='/v1/search'){
        const body=await readJson(req);
        const findingNumber=Number(body.finding_number);
        const hasFindingNumber=Number.isInteger(findingNumber)&&findingNumber>0;
        const sourceDocument=clean(body.source_document);
        const text=clean(body.text);
        if(!hasFindingNumber&&!sourceDocument&&!text){
          return send(res,400,{ok:false,error:'search_filter_required'});
        }
        if(text&&text.length<2) return send(res,400,{ok:false,error:'search_text_too_short'});
        if(text.length>160) return send(res,400,{ok:false,error:'search_text_too_long'});
        if(sourceDocument.length>240) return send(res,400,{ok:false,error:'source_document_too_long'});
        const requestedLimit=Math.max(1,Math.min(Number(body.limit)||25,50));
        const result=searchForensicFindings({
          stateDir:root,
          findingNumber:hasFindingNumber?findingNumber:null,
          sourceDocument,
          text,
          limit:requestedLimit,
        });
        return send(res,200,{
          ok:true,
          schema:'evercraft.forensic-record.public-search-results.v1',
          query:{
            finding_number:hasFindingNumber?findingNumber:null,
            source_document:sourceDocument||null,
            text:text||null,
          },
          count:result.results.length,
          results:result.results.map(publicFinding),
        });
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message==='request_body_too_large'?413:500;
      return send(res,status,{ok:false,error:message});
    }
  });

  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const addr=server.address();
  const actualPort=typeof addr==='object'&&addr?addr.port:port;
  return {
    schema:'evercraft.forensic-record.public-runtime.v1',
    service:'forensic-record-public-runtime',
    instance_id:instanceId,
    service_url:'http://'+host+':'+actualPort,
    health_path:'/health',
    search_path:'/v1/search',
    stats_path:'/v1/stats',
    finding_path_template:'/v1/findings/{finding_number}',
    health,
    setDeploymentReceipt:(receiptRef)=>{
      deploymentReceiptRef=clean(receiptRef);
      return health();
    },
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}
