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

function sendHtml(res,status,body){
  const data=Buffer.from(String(body||''));
  res.writeHead(status,{
    'content-type':'text/html; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'content-security-policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY'
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
          mode:'public_read_only_plus_human_handoff',
          actions:['wait','wait_for_selector','scroll','follow_anchor'],
          arbitrary_click:false,
          form_submit:false,
          credentials:false,
          cookies:false,
          private_targets:false,
          authenticated_human_handoff:
            typeof runtime.authHandoffPage==='function' &&
            typeof runtime.authSnapshot==='function' &&
            typeof runtime.authAction==='function' &&
            typeof runtime.authClose==='function',
          authenticated_handoff_persists_profile:false,
          authenticated_handoff_secret_text_returned:false,
          max_request_bytes:MAX_BODY_BYTES,
        });
      }

      const handoffMatch=String(req.url||'').match(/^\/handoff\/([A-Za-z0-9_-]+)$/);
      if(req.method==='GET' && handoffMatch){
        if(typeof runtime.authHandoffPage!=='function'){
          return sendJson(res,503,{ok:false,error:'authenticated_browser_handoff_unavailable'});
        }
        return sendHtml(res,200,await runtime.authHandoffPage(handoffMatch[1]));
      }

      const snapshotMatch=String(req.url||'').match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)\/snapshot$/);
      if(req.method==='GET' && snapshotMatch){
        if(typeof runtime.authSnapshot!=='function'){
          return sendJson(res,503,{ok:false,error:'authenticated_browser_handoff_unavailable'});
        }
        const claim=String(req.headers['x-evercraft-browser-claim']||'').trim();
        return sendJson(res,200,await runtime.authSnapshot(snapshotMatch[1],claim));
      }

      const actionMatch=String(req.url||'').match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)\/action$/);
      if(req.method==='POST' && actionMatch){
        if(typeof runtime.authAction!=='function'){
          return sendJson(res,503,{ok:false,error:'authenticated_browser_handoff_unavailable'});
        }
        const claim=String(req.headers['x-evercraft-browser-claim']||'').trim();
        const action=await readJson(req);
        return sendJson(res,200,await runtime.authAction(actionMatch[1],claim,action));
      }

      const closeMatch=String(req.url||'').match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)$/);
      if(req.method==='DELETE' && closeMatch){
        if(typeof runtime.authClose!=='function'){
          return sendJson(res,503,{ok:false,error:'authenticated_browser_handoff_unavailable'});
        }
        const claim=String(req.headers['x-evercraft-browser-claim']||'').trim();
        return sendJson(res,200,await runtime.authClose(closeMatch[1],claim));
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
      const authError=message==='authenticated_browser_claim_invalid';
      const missingError=message==='authenticated_browser_session_not_found';
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
      return sendJson(res,authError?401:missingError?404:clientError?400:500,{
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
