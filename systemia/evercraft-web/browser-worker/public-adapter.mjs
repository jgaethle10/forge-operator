import http from 'node:http';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(data);
}

async function readJson(req){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>MAX_BODY_BYTES) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  if(!raw) return {};
  try{return JSON.parse(raw);}catch{throw new Error('invalid_json');}
}

export async function startBrowserPublicAdapter({
  runtime,
  host='127.0.0.1',
  port=0,
  maxRequestsPerMinute=120,
}={}){
  if(!runtime || typeof runtime.browse!=='function' || typeof runtime.health!=='function'){
    throw new Error('browser_runtime_required');
  }

  const limit=Math.max(1,Math.min(1000,Number(maxRequestsPerMinute)||120));
  let windowStarted=Date.now();
  let requestCount=0;
  let active=0;

  const consumeRate=()=>{
    const now=Date.now();
    if(now-windowStarted>=60_000){
      windowStarted=now;
      requestCount=0;
    }
    requestCount+=1;
    return requestCount<=limit;
  };

  const publicHealth=async()=>{
    const worker=await runtime.health();
    return {
      ok:worker?.ok===true,
      service:'evercraft-web-browser-edge',
      runtime:'Evercraft Compute',
      mode:'public_read_only',
      browser_engine:worker?.engine||'evercraft-owned-browser-worker-v1',
      instance_id:worker?.instance_id||runtime.instanceId||null,
      deployment_receipt_bound:Boolean(worker?.deployment_receipt_ref),
      deployment_receipt_ref:worker?.deployment_receipt_ref||null,
      raw_worker_publicly_exposed:false,
      active_requests:active,
      requests_per_minute_limit:limit,
    };
  };

  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET' && req.url==='/health'){
        return sendJson(res,200,await publicHealth());
      }

      if(req.method==='GET' && req.url==='/v1/browser/capabilities'){
        return sendJson(res,200,{
          ok:true,
          service:'evercraft-web-browser-edge',
          mode:'public_read_only',
          actions:['wait','wait_for_selector','scroll','follow_anchor'],
          arbitrary_click:false,
          form_submit:false,
          credentials:false,
          cookies:false,
          private_targets:false,
          max_request_bytes:MAX_BODY_BYTES,
        });
      }

      if(req.method==='POST' && req.url==='/v1/browser/render'){
        if(!consumeRate()){
          return sendJson(res,429,{ok:false,error:'rate_limited',retryable:true});
        }
        const job=await readJson(req);
        active+=1;
        try{
          const result=await runtime.browse(job);
          return sendJson(res,200,{ok:true,result});
        }finally{
          active-=1;
        }
      }

      return sendJson(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const clientError=
        message==='request_body_too_large' ||
        message==='invalid_json' ||
        message==='invalid_url_length' ||
        message==='invalid_url' ||
        message==='unsupported_url_scheme' ||
        message==='missing_hostname' ||
        message==='embedded_credentials_not_allowed' ||
        message==='unsupported_port' ||
        message==='private_or_reserved_target' ||
        message==='dns_resolution_failed' ||
        message==='dns_resolution_empty' ||
        message==='too_many_actions' ||
        message.startsWith('unsupported_action') ||
        message.startsWith('invalid_selector') ||
        message.startsWith('invalid_anchor_selector');
      return sendJson(res,clientError?400:500,{
        ok:false,
        error:message,
        service:'evercraft-web-browser-edge'
      });
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  if(!address || typeof address==='string') throw new Error('browser_public_adapter_bind_failed');

  return {
    url:`http://${host}:${address.port}`,
    health:publicHealth,
    close:()=>new Promise((resolve)=>server.close(()=>resolve())),
  };
}
