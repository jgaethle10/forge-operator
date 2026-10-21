import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { startBrowserPublicAdapter } from './public-adapter.mjs';
import { signDurableJobRequest } from './systemia-admission.mjs';

const DEFAULT_START_TIMEOUT_MS=30_000;
const DEFAULT_INSTALL_TIMEOUT_MS=10*60_000;

const sha256=(value)=>crypto.createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function run(command,args,{cwd,env,timeout=30_000}={}){
  const result=spawnSync(command,args,{
    cwd,
    env:{...process.env,...env},
    encoding:'utf8',
    timeout,
    maxBuffer:8*1024*1024,
    stdio:['ignore','pipe','pipe'],
  });
  if(result.error) throw result.error;
  if(result.status!==0){
    const detail=String(result.stderr||result.stdout||'').trim().slice(0,4000);
    throw new Error(`${command}_failed:${detail||result.status}`);
  }
  return String(result.stdout||'').trim();
}

async function reserveLoopbackPort(){
  const server=net.createServer();
  server.unref?.();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const port=address&&typeof address!=='string'?Number(address.port):0;
  await new Promise((resolve)=>server.close(resolve));
  if(!Number.isInteger(port)||port<=0) throw new Error('native_browser_port_unavailable');
  return port;
}

async function fetchJson(url,options={},timeoutMs=10_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch{
      throw new Error(`browser_worker_invalid_json:${response.status}`);
    }
    if(!response.ok){
      const error=new Error(body?.error||`browser_worker_http_${response.status}`);
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}

async function fetchText(url,options={},timeoutMs=10_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const body=await response.text();
    if(!response.ok){
      const error=new Error(`browser_worker_http_${response.status}`);
      error.status=response.status;
      error.body=body.slice(0,2000);
      throw error;
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}

async function waitForHealth(url,{timeoutMs=DEFAULT_START_TIMEOUT_MS,child=null}={}){
  const deadline=Date.now()+timeoutMs;
  let lastError=null;
  while(Date.now()<deadline){
    if(child?.exitCode!=null){
      throw new Error(`native_browser_worker_exited:${child.exitCode}`);
    }
    try{
      const health=await fetchJson(`${url}/healthz`,{},1500);
      if(health?.ok===true&&health?.service==='evercraft-owned-browser-worker'){
        return health;
      }
    }catch(error){lastError=error;}
    await new Promise((resolve)=>setTimeout(resolve,250));
  }
  throw new Error(
    `native_browser_worker_health_timeout:${lastError?.message||'unknown'}`
  );
}

function expectedPlaywrightVersion(sourceDir){
  const pkg=JSON.parse(fs.readFileSync(path.join(sourceDir,'package.json'),'utf8'));
  return String(pkg.dependencies?.playwright||'').replace(/^[^0-9]*/,'');
}

function installedPlaywrightVersion(sourceDir){
  try{
    const pkg=JSON.parse(
      fs.readFileSync(
        path.join(sourceDir,'node_modules','playwright','package.json'),
        'utf8'
      )
    );
    return String(pkg.version||'');
  }catch{
    return '';
  }
}

function chromiumLaunchPreflight({sourceDir,browsersPath,timeoutMs=45_000}={}){
  const script=[
    "import { chromium } from 'playwright';",
    "const b=await chromium.launch({headless:true});",
    "const v=b.version();",
    "await b.close();",
    "process.stdout.write(JSON.stringify({ok:true,version:v}));",
  ].join('');
  const output=run(process.execPath,['--input-type=module','-e',script],{
    cwd:sourceDir,
    env:{PLAYWRIGHT_BROWSERS_PATH:browsersPath},
    timeout:timeoutMs,
  });
  const body=JSON.parse(output||'{}');
  if(body.ok!==true||!body.version) throw new Error('native_browser_launch_preflight_invalid');
  return body;
}

export async function prepareNativeBrowserRuntime({
  sourceDir,
  stateDir,
  allowInstall=true,
  installTimeoutMs=DEFAULT_INSTALL_TIMEOUT_MS,
}={}){
  const root=path.resolve(String(sourceDir||''));
  const state=path.resolve(String(stateDir||''));
  if(!root||!fs.existsSync(path.join(root,'package.json'))){
    throw new Error('native_browser_source_dir_required');
  }
  if(!state) throw new Error('native_browser_state_dir_required');
  fs.mkdirSync(state,{recursive:true,mode:0o700});
  const browsersPath=path.join(state,'browsers');
  fs.mkdirSync(browsersPath,{recursive:true,mode:0o700});
  const expected=expectedPlaywrightVersion(root);
  let installed=installedPlaywrightVersion(root);
  let installAttempted=false;
  let installState='not_needed';
  let preflight=null;
  let reason=null;

  const tryPreflight=()=>{
    if(!installed||installed!==expected){
      throw new Error('playwright_dependency_not_ready');
    }
    return chromiumLaunchPreflight({
      sourceDir:root,
      browsersPath,
    });
  };

  try{
    preflight=tryPreflight();
  }catch(firstError){
    reason=String(firstError?.message||firstError).slice(0,400);
    if(allowInstall!==true){
      const body={
        schema:'evercraft.browser.native-runtime-preflight.v1',
        ready:false,
        mode:'native_user_playwright',
        expected_playwright_version:expected||null,
        installed_playwright_version:installed||null,
        install_attempted:false,
        install_state:'disabled',
        reason,
        authority:'user_space_only',
        sudo_used:false,
        system_package_manager_used:false,
        checked_at:new Date().toISOString(),
      };
      const receipt={...body,receipt_hash:'sha256:'+sha256(body)};
      atomicJson(path.join(state,'preflight.json'),receipt);
      return {...receipt,browserRuntimeFactory:null};
    }

    installAttempted=true;
    try{
      run('npm',[
        'install',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--package-lock=false',
      ],{
        cwd:root,
        env:{PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'},
        timeout:installTimeoutMs,
      });
      installed=installedPlaywrightVersion(root);
      if(!installed||installed!==expected){
        throw new Error(
          `playwright_version_mismatch:${installed||'missing'}:${expected||'unknown'}`
        );
      }
      const cli=path.join(root,'node_modules','playwright','cli.js');
      if(!fs.existsSync(cli)) throw new Error('playwright_cli_missing');
      run(process.execPath,[cli,'install','chromium'],{
        cwd:root,
        env:{PLAYWRIGHT_BROWSERS_PATH:browsersPath},
        timeout:installTimeoutMs,
      });
      preflight=tryPreflight();
      installState='installed';
      reason=null;
    }catch(error){
      installState='failed';
      reason=String(error?.message||error).slice(0,800);
    }
  }

  const ready=Boolean(preflight?.ok===true);
  const body={
    schema:'evercraft.browser.native-runtime-preflight.v1',
    ready,
    mode:'native_user_playwright',
    expected_playwright_version:expected||null,
    installed_playwright_version:installed||null,
    chromium_version:preflight?.version||null,
    install_attempted:installAttempted,
    install_state:installState,
    reason:ready?null:reason,
    authority:'user_space_only',
    sudo_used:false,
    system_package_manager_used:false,
    browsers_path_hash:'sha256:'+sha256(browsersPath),
    checked_at:new Date().toISOString(),
  };
  const receipt={...body,receipt_hash:'sha256:'+sha256(body)};
  atomicJson(path.join(state,'preflight.json'),receipt);

  if(!ready) return {...receipt,browserRuntimeFactory:null};

  const browserRuntimeFactory=(options={})=>startNativeBrowserRuntime({
    ...options,
    sourceDir:root,
    browsersPath,
  });
  return {...receipt,browserRuntimeFactory};
}

export async function startNativeBrowserRuntime({
  sourceDir,
  browsersPath,
  maxConcurrency=2,
  startTimeoutMs=DEFAULT_START_TIMEOUT_MS,
  jobStateDir='',
  systemiaJobKey='',
}={}){
  const root=path.resolve(String(sourceDir||''));
  const browserRoot=path.resolve(String(browsersPath||''));
  if(!fs.existsSync(path.join(root,'server.mjs'))){
    throw new Error('native_browser_server_missing');
  }
  if(!fs.existsSync(path.join(root,'node_modules','playwright','package.json'))){
    throw new Error('native_browser_playwright_missing');
  }
  const port=await reserveLoopbackPort();
  const workerToken=crypto.randomBytes(32).toString('hex');
  if(systemiaJobKey && Buffer.byteLength(String(systemiaJobKey))<32){
    throw new Error('native_browser_systemia_signing_key_invalid');
  }
  const jobSigningKey=String(systemiaJobKey||crypto.randomBytes(32).toString('hex'));
  const authOperatorToken=crypto.randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['server.mjs'],{
    cwd:root,
    env:{
      ...process.env,
      PORT:String(port),
      EVERCRAFT_BROWSER_WORKER_TOKEN:workerToken,
      EVERCRAFT_BROWSER_SYSTEMIA_JOB_KEY:jobSigningKey,
      EVERCRAFT_AUTH_BROWSER_OPERATOR_TOKEN:authOperatorToken,
      EVERCRAFT_BROWSER_MAX_CONCURRENCY:String(
        Math.max(1,Math.min(8,Number(maxConcurrency)||2))
      ),
      PLAYWRIGHT_BROWSERS_PATH:browserRoot,
      EVERCRAFT_BROWSER_JOB_STATE_DIR:jobStateDir ? path.resolve(jobStateDir) : '',
    },
    stdio:['ignore','pipe','pipe'],
  });

  const logs=[];
  const capture=(chunk)=>{
    if(logs.length<80) logs.push(String(chunk||'').slice(0,2000));
  };
  child.stdout?.on('data',capture);
  child.stderr?.on('data',capture);
  let closed=false;
  let deploymentReceiptRef='';

  const shutdownChild=async()=>{
    if(child.exitCode!=null) return;
    child.kill('SIGTERM');
    const timeout=new Promise((resolve)=>setTimeout(resolve,5000,'timeout'));
    const outcome=await Promise.race([
      once(child,'exit').then(()=> 'exit').catch(()=> 'exit'),
      timeout,
    ]);
    if(outcome==='timeout'&&child.exitCode==null) child.kill('SIGKILL');
  };

  try{
    const url=`http://127.0.0.1:${port}`;
    const initialHealth=await waitForHealth(url,{timeoutMs:startTimeoutMs,child});
    const instanceId=`browser_native_${child.pid||crypto.randomBytes(6).toString('hex')}`;

    const health=async()=>{
      const worker=await fetchJson(`${url}/healthz`,{},3000);
      return {
        ...worker,
        runtime:'Evercraft Compute',
        execution_mode:'native_user_playwright',
        instance_id:instanceId,
        process_id_hash:child.pid
          ? sha256(String(child.pid))
          : null,
        deployment_receipt_ref:deploymentReceiptRef||null,
      };
    };

    const runtime={
      url,
      instanceId,
      image:null,
      initialHealth,
      async health(){return health();},
      async browse(job){
        return fetchJson(`${url}/v1/browse`,{
          method:'POST',
          headers:{
            'content-type':'application/json',
            authorization:`Bearer ${workerToken}`,
          },
          body:JSON.stringify(job||{}),
        },Math.max(35_000,Number(job?.timeout_ms||15_000)+5000));
      },
      async submitReadOnlyJob(envelope){
        const endpoint='/v1/jobs';
        const raw=JSON.stringify(envelope||{});
        return fetchJson(`${url}${endpoint}`,{
          method:'POST',
          headers:{
            'content-type':'application/json',
            ...signDurableJobRequest(jobSigningKey,{method:'POST',path:endpoint,body:raw}),
          },
          body:raw,
        },10_000);
      },
      async readReadOnlyJob(jobId){
        const endpoint=`/v1/jobs/${encodeURIComponent(String(jobId||''))}`;
        return fetchJson(`${url}${endpoint}`,{
          headers:signDurableJobRequest(jobSigningKey,{method:'GET',path:endpoint,body:''}),
        },10_000);
      },
      async cancelReadOnlyJob(jobId){
        const endpoint=`/v1/jobs/${encodeURIComponent(String(jobId||''))}`;
        return fetchJson(`${url}${endpoint}`,{
          method:'DELETE',
          headers:signDurableJobRequest(jobSigningKey,{method:'DELETE',path:endpoint,body:''}),
        },10_000);
      },
      async createAuthSession(job){
        return fetchJson(`${url}/v1/auth-browser/sessions`,{
          method:'POST',
          headers:{
            'content-type':'application/json',
            authorization:`Bearer ${authOperatorToken}`,
          },
          body:JSON.stringify(job||{}),
        },35_000);
      },
      async authHandoffPage(sessionId){
        return fetchText(
          `${url}/handoff/${encodeURIComponent(String(sessionId||''))}`,
          {},
          5000
        );
      },
      async authSnapshot(sessionId,claimToken){
        return fetchJson(
          `${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId||''))}/snapshot`,
          {headers:{'x-evercraft-browser-claim':String(claimToken||'')}},
          10_000
        );
      },
      async authAction(sessionId,claimToken,action){
        return fetchJson(
          `${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId||''))}/action`,
          {
            method:'POST',
            headers:{
              'content-type':'application/json',
              'x-evercraft-browser-claim':String(claimToken||''),
            },
            body:JSON.stringify(action||{}),
          },
          35_000
        );
      },
      async authDelegate(sessionId,claimToken,policy={}){
        return fetchJson(
          `${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId||''))}/delegate`,
          {
            method:'POST',
            headers:{
              'content-type':'application/json',
              'x-evercraft-browser-claim':String(claimToken||''),
            },
            body:JSON.stringify(policy),
          },
          10_000
        );
      },
      async authRevokeDelegation(sessionId,claimToken){
        return fetchJson(
          `${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId||''))}/delegate`,
          {
            method:'DELETE',
            headers:{'x-evercraft-browser-claim':String(claimToken||'')},
          },
          10_000
        );
      },
      async delegatedSnapshot(sessionId){
        return fetchJson(
          `${url}/v1/auth-browser/delegated/${encodeURIComponent(String(sessionId||''))}/snapshot`,
          {headers:{authorization:`Bearer ${authOperatorToken}`}},
          10_000
        );
      },
      async delegatedAction(sessionId,action){
        return fetchJson(
          `${url}/v1/auth-browser/delegated/${encodeURIComponent(String(sessionId||''))}/action`,
          {
            method:'POST',
            headers:{
              authorization:`Bearer ${authOperatorToken}`,
              'content-type':'application/json',
            },
            body:JSON.stringify(action||{}),
          },
          35_000
        );
      },
      async authClose(sessionId,claimToken){
        return fetchJson(
          `${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId||''))}`,
          {
            method:'DELETE',
            headers:{'x-evercraft-browser-claim':String(claimToken||'')},
          },
          10_000
        );
      },
      setDeploymentReceipt(receiptRef){
        deploymentReceiptRef=String(receiptRef||'');
        return {
          ok:true,
          service:'evercraft-owned-browser-worker',
          runtime:'Evercraft Compute',
          instance_id:instanceId,
          deployment_receipt_ref:deploymentReceiptRef||null,
        };
      },
      async close(){},
    };

    const publicAdapter=await startBrowserPublicAdapter({
      runtime,
      host:'127.0.0.1',
      port:0,
      maxRequestsPerMinute:120,
    });
    runtime.localPublicUrl=publicAdapter.url;
    runtime.publicAdapterHealth=publicAdapter.health;
    runtime.close=async()=>{
      if(closed) return;
      closed=true;
      try{await publicAdapter.close();}catch{}
      await shutdownChild();
    };
    return runtime;
  }catch(error){
    await shutdownChild().catch(()=>{});
    const detail=logs.join('\n').slice(-6000);
    const suffix=detail?`:${detail}`:'';
    throw new Error(`${error?.message||error}${suffix}`);
  }
}
