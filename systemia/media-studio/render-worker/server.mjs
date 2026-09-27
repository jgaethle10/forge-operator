import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildStageHtml } from './runtime.mjs';
import { MAX_BODY_BYTES, sanitizeRenderJob } from './policy.mjs';

const PORT=Math.max(1,Math.min(65535,Number(process.env.PORT||8787)));
const TOKEN=String(process.env.FALLEN_RENDER_WORKER_TOKEN||'');
const ASSET_ROOT=path.resolve(process.env.FALLEN_RENDER_ASSET_ROOT||'/work/assets');
const OUTPUT_ROOT=path.resolve(process.env.FALLEN_RENDER_OUTPUT_ROOT||'/work/output');
const MAX_CONCURRENCY=Math.max(1,Math.min(4,Number(process.env.FALLEN_RENDER_MAX_CONCURRENCY||1)));
const ENGINE='evercraft-fallen-render-worker-v1';

if(!TOKEN) throw new Error('FALLEN_RENDER_WORKER_TOKEN is required');
fs.mkdirSync(ASSET_ROOT,{recursive:true});
fs.mkdirSync(OUTPUT_ROOT,{recursive:true});

let browserPromise=null,activeJobs=0;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');

function json(res,status,body){
  const payload=JSON.stringify(body);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(payload),'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(payload);
}
function authorized(req){
  const raw=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from(`Bearer ${TOKEN}`);
  return raw.length===expected.length&&crypto.timingSafeEqual(raw,expected);
}
async function readJson(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY_BYTES)throw new Error('request_body_too_large');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw new Error('invalid_json')}
}
async function browser(){
  if(!browserPromise) browserPromise=chromium.launch({headless:true}).catch(error=>{browserPromise=null;throw error});
  return browserPromise;
}
function assetPath(jobId,row){
  const root=path.resolve(ASSET_ROOT,jobId);
  const file=path.resolve(root,row.filename);
  if(file!==root&&!file.startsWith(root+path.sep)) throw new Error('asset_path_escape');
  return file;
}
function verifyAssets(job){
  const map=new Map();
  for(const row of job.assets){
    const file=assetPath(job.job_id,row);
    if(!fs.existsSync(file)) throw new Error(`asset_not_staged:${row.id}`);
    const observed=sha(fs.readFileSync(file));
    if(observed!==row.sha256) throw new Error(`asset_digest_mismatch:${row.id}`);
    map.set(row.id,{...row,file});
  }
  return map;
}
function rangeResponse(buffer,rangeHeader){
  const raw=String(rangeHeader||'');
  const match=raw.match(/^bytes=(\d+)-(\d*)$/);
  if(!match) return {status:200,body:buffer,headers:{'accept-ranges':'bytes','content-length':String(buffer.length)}};
  const start=Math.min(buffer.length-1,Number(match[1]));
  const end=match[2]?Math.min(buffer.length-1,Number(match[2])):buffer.length-1;
  if(start>end) return {status:416,body:Buffer.alloc(0),headers:{'content-range':`bytes */${buffer.length}`}};
  const body=buffer.subarray(start,end+1);
  return {status:206,body,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${buffer.length}`,'content-length':String(body.length)}};
}
async function render(job){
  const assets=verifyAssets(job),b=await browser();
  const context=await b.newContext({viewport:{width:job.stage.width,height:job.stage.height},javaScriptEnabled:true,serviceWorkers:'block',acceptDownloads:false});
  const outputDir=path.resolve(OUTPUT_ROOT,job.job_id);
  fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  const frames=[];
  let page;
  try{
    await context.route('**/*',async route=>{
      const request=route.request(),u=new URL(request.url());
      if(u.protocol==='https:'&&u.hostname==='fallen.local'&&u.pathname.startsWith('/assets/')){
        const id=decodeURIComponent(u.pathname.slice('/assets/'.length)),asset=assets.get(id);
        if(!asset){await route.abort('blockedbyclient');return}
        const buffer=fs.readFileSync(asset.file),r=rangeResponse(buffer,request.headers().range);
        await route.fulfill({status:r.status,body:r.body,contentType:asset.media_type,headers:r.headers});return;
      }
      await route.abort('blockedbyclient');
    });
    page=await context.newPage();
    const consoleErrors=[];
    page.on('console',msg=>{if(msg.type()==='error'&&consoleErrors.length<50)consoleErrors.push(msg.text().slice(0,1000))});
    await page.setContent(buildStageHtml(job.stage),{waitUntil:'load',timeout:15000});
    await page.waitForFunction(()=>window.__evercraftStageReady===true,null,{timeout:5000});
    for(let offset=0;offset<job.frame_count;offset+=1){
      const frame=job.frame_start+offset;
      await page.evaluate(async value=>{document.documentElement.dataset.evercraftFrameReady='false';await window.__evercraftRenderFrame(value)},frame);
      await page.waitForFunction(()=>document.documentElement.dataset.evercraftFrameReady==='true',null,{timeout:5000});
      const png=await page.screenshot({type:'png',animations:'disabled',caret:'hide',clip:{x:0,y:0,width:job.stage.width,height:job.stage.height}});
      const filename=`frame-${String(frame).padStart(8,'0')}.png`,file=path.join(outputDir,filename);
      fs.writeFileSync(file,png,{mode:0o600});
      frames.push({frame,filename,bytes:png.length,sha256:sha(png),time_sec:Number((frame/job.stage.fps).toFixed(6))});
    }
    const receipt={
      schema:'evercraft.fallen.render-receipt.v1',
      engine:ENGINE,job_id:job.job_id,
      stage_id:job.stage.id,
      stage_sha256:sha(JSON.stringify({...job.stage,createdAt:undefined})),
      frame_start:job.frame_start,frame_count:job.frame_count,total_frames:job.total_frames,
      assets:[...assets.values()].map(({file,...row})=>row),
      frames,console_errors:consoleErrors,
      boundaries:{external_network_allowed:false,arbitrary_html_accepted:false,asset_uri_only:true,asset_sha256_verified:true,exact_frame_control:true}
    };
    receipt.receipt_sha256=sha(JSON.stringify(receipt));
    fs.writeFileSync(path.join(outputDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
    return receipt;
  }finally{await context.close().catch(()=>{})}
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='GET'&&req.url==='/healthz'){json(res,200,{ok:true,service:'fallen-render-worker',engine:ENGINE,active_jobs:activeJobs,max_concurrency:MAX_CONCURRENCY});return}
    if(req.method!=='POST'||req.url!=='/v1/render'){json(res,404,{ok:false,error:'not_found'});return}
    if(!authorized(req)){json(res,401,{ok:false,error:'unauthorized'});return}
    if(activeJobs>=MAX_CONCURRENCY){json(res,429,{ok:false,error:'capacity_exhausted',retryable:true});return}
    const job=sanitizeRenderJob(await readJson(req));activeJobs+=1;
    try{json(res,200,{ok:true,...await render(job)})}finally{activeJobs-=1}
  }catch(error){const message=error instanceof Error?error.message:String(error);const client=/^(render_job_|stage_|job_id_|asset_|media_|layer_|duplicate_|too_many_|camera_|evidence_|invalid_json|request_body_too_large)/.test(message);json(res,client?400:500,{ok:false,error:message,engine:ENGINE})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'fallen_render_worker_listening',port:PORT,engine:ENGINE})));
async function shutdown(){server.close();if(browserPromise){try{(await browserPromise).close()}catch{}}process.exit(0)}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
