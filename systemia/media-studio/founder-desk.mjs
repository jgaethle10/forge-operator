#!/usr/bin/env node
// Evercraft Fallen Founder Desk. PRIVATE localhost work intake, not a public SaaS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectCommercialPicture} from './commercial-visual-qc.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA='evercraft.fallen.founder-job.v1';
const safeId=/^[a-z0-9][a-z0-9-]{1,79}$/;
const seed=[
 ['tile-works','Tile Works','V5 LOOK CLOSER plan. Bella af_bella voice, original music, source permissions and final verified CTA still need evidence.'],
 ['pacific-mechanic','Pacific Mechanic','Recover the original customer brief, footage and approved copy. No source or final master verified.'],
 ['flame-and-brew','Flame & Brew','Use real licensed food footage, not animated previs. Voice and real musical score must be auditioned.'],
 ['icy-tai','Icy Tai','Confirm exact branding. Use actual food and people only with rights; animated previs and music drafts are not finished masters.'],
];
const clean=x=>typeof x==='string'?x.trim():'';
const slug=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const extSet=new Set(['.jpg','.jpeg','.png','.webp','.mp4','.mov','.wav','.mp3','.m4a','.srt']);
const maxMedia=250*1024*1024;
export function newJob(id,name,note=''){
  if(!safeId.test(id)||!clean(name))throw Error('invalid_job_identity');
  return {schema:SCHEMA,id,name,goal:'',audience:'',offer:'',cta:'',format:'9:16',
    notes:note,narration:'narrated',assets:[],approvedAssembly:false,technicalRender:null};
}
export function patchJob(job,patch) {
  const next={...job};
  for(const key of ['name','goal','audience','offer','cta','notes']){
    if(Object.hasOwn(patch,key)){
      if(typeof patch[key]!=='string'||patch[key].length>2000)throw Error('invalid_field_'+key);
      next[key]=patch[key].trim();
    }
  }
  if(Object.hasOwn(patch,'narration')){
    if(!['narrated','music_only'].includes(patch.narration))throw Error('invalid_narration_mode');
    next.narration=patch.narration;
  }
  if(Object.hasOwn(patch,'format')){
    if(!['9:16','16:9','1:1'].includes(patch.format))throw Error('invalid_format');
    next.format=patch.format;
  }
  return next;
}
export function readiness(job){
  const blockers=[];
  for(const key of ['goal','audience','offer','cta'])if(!clean(job[key]))blockers.push('Confirm '+key);
  if(!job.assets.some(x=>x.type==='picture'))blockers.push('Upload authorized real picture or video');
  if(!job.assets.some(x=>x.type==='picture'&&x.rights==='reviewed'))blockers.push('Record reviewed picture rights evidence');
  if(!job.assets.some(x=>x.type==='music'&&x.rights==='reviewed'))blockers.push('Approve actual music recording and rights');
  if(job.narration!=='music_only'&&!job.assets.some(x=>x.type==='voice'&&x.rights==='reviewed'))
    blockers.push('Approve actual narration take and rights');
  if(!job.approvedAssembly)blockers.push('Approved source-first assembly still required');
  if(!job.technicalRender)blockers.push('No rendered technical master');
  if(job.technicalRender?.pictureStatus==='review_required')
    blockers.push('Automated picture scan flagged low activity: director must inspect each beat');
  if(job.technicalRender?.pictureStatus==='inspection_failed')
    blockers.push('Automated picture inspection failed; do not clear this master');
  blockers.push('Independent final-master Signature review and client approval required');
  return {state:job.technicalRender?'rendered_technical_only':'not_client_ready',
    blockers,canPublish:false,canDeliver:false,canCharge:false};
}
export function packet(job){
  return {schema:'evercraft.fallen.founder-production-packet.v1',
    project:{id:job.id,name:job.name,goal:job.goal,audience:job.audience,
      offer:job.offer,cta:job.cta,format:job.format,notes:job.notes,narration:job.narration},
    assets:job.assets.map(x=>({id:x.id,name:x.name,type:x.type,size:x.size,sha256:x.sha256,
      rights:x.rights,evidence:x.evidence})),
    readiness:readiness(job),productionRoute:{
      planning:'commercial-shotlist.mjs',assembly:'commercial-assembly.mjs',
      finalGate:'customer-commercial-gate.mjs + fallen-signature-gate.mjs'},
    restrictions:{noAutomaticPublishing:true,noFalseApproval:true,noProviderSpending:true}};
}
function jobPath(root,id){
  if(!safeId.test(id))throw Error('invalid_job_id');
  return path.join(root,'jobs',id,'job.json');
}
function store(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.tmp-'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function load(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
export function initialize(root){
  fs.mkdirSync(path.join(root,'jobs'),{recursive:true,mode:0o700});
  for(const [id,name,note] of seed){
    const p=jobPath(root,id);
    if(!fs.existsSync(p))store(p,newJob(id,name,note));
  }
}
function jobs(root){return fs.readdirSync(path.join(root,'jobs'),{withFileTypes:true})
  .filter(x=>x.isDirectory()&&safeId.test(x.name))
  .map(x=>load(jobPath(root,x.name))).map(job=>({...job,readiness:readiness(job)}));}
function reply(res,code,data){
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
async function json(req,max=2*1024*1024){
  let size=0,chunks=[];
  for await(const chunk of req){
    size+=chunk.length;if(size>max)throw Error('json_too_large');chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function ingest(req,root,job,type,name){
  if(!['picture','voice','music','captions'].includes(type))throw Error('unsupported_media_role');
  name=path.basename(name||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,110);
  const ext=path.extname(name).toLowerCase();
  if(!extSet.has(ext))throw Error('unsupported_extension');
  const id=crypto.randomUUID();
  const file=path.join(root,'jobs',job.id,'media',id+ext);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const f=fs.openSync(file,'wx',0o600),sha=crypto.createHash('sha256');
  let size=0,good=false;
  try{
    for await (const chunk of req) {
      size+=chunk.length;
      if(size>maxMedia)throw Error('media_too_large');
      let offset=0;while(offset<chunk.length)offset+=fs.writeSync(f,chunk,offset,chunk.length-offset);
      sha.update(chunk);
    }
    if(!size)throw Error('empty_media');
    good=true;
  }finally{fs.closeSync(f);if(!good)fs.rmSync(file,{force:true});}
  const asset={id,name,type,size,sha256:sha.digest('hex'),privatePath:file,
    rights:'unreviewed',evidence:'',technicalState:'bytes_received_not_auditioned'};
  job.assets.push(asset);store(jobPath(root,job.id),job);return asset;
}
async function render(root,job){
  if(!job.approvedAssembly)throw Error('approved_assembly_not_uploaded');
  const input=path.join(root,'jobs',job.id,'approved-assembly.json');
  const output=path.join(root,'jobs',job.id,'renders',Date.now().toString());
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  return await new Promise(resolve=>{
    const cmd=spawn(process.execPath,['--import','tsx',path.join(HERE,'commercial-assembly.mjs'),input,output,'render'],
      {cwd:path.resolve(HERE,'../..'),shell:false,stdio:['ignore','pipe','pipe']});
    let logs='';
    const add=b=>{logs=(logs+String(b)).slice(-12000);};
    cmd.stdout.on('data',add);cmd.stderr.on('data',add);
    const timer=setTimeout(()=>cmd.kill('SIGKILL'),600000);
    cmd.once('error',add);
    cmd.once('close',status=>{
      clearTimeout(timer);
      const f=path.join(output,'commercial-render-receipt.json');
      if(status===0&&fs.existsSync(f)){
        const result=load(f);
        if(result.status==='rendered_and_technically_qc_accepted'){
          // Inspect the *actual final master* using the brief's exact scene timing.
          // Luma motion analysis flags static shots but does not claim cinematic quality.
          let pictureStatus='inspection_failed',flaggedBeats=[],pictureError=null;
          try{
            const manifest=load(input);
            const beats=manifest.brief.scenes.map(x=>({id:x.id,durationSec:x.durationSec}));
            const pic=inspectCommercialPicture({filePath:result.videoPath,
              expectedSha256:result.mediaSha256,beats});
            pictureStatus=pic.status;
            flaggedBeats=pic.segments.filter(x=>x.flags.length).map(x=>({beatId:x.beatId,flags:x.flags}));
            store(path.join(output,'founder-picture-qc.json'),pic);
          }catch(e){pictureError=String(e.message||e);}
          job.technicalRender={sha256:result.mediaSha256,localVideoPath:result.videoPath,
            receiptPath:f,qualityState:'technical_only_not_client_ready',
            pictureStatus,flaggedBeats,pictureError};
          store(jobPath(root,job.id),job);
          return resolve({ok:true,pictureStatus,flaggedBeats,readiness:readiness(job)});
        }
      }
      resolve({ok:false,diagnostics:logs,state:'render_failed_without_customer_delivery'});
    });
  });
}
export function makeServer({root,port=8793}){
  if(!root||!Number.isInteger(port))throw Error('private_root_and_port_required');
  initialize(root);
  const token=crypto.randomBytes(24).toString('hex');
  const busy=new Set();
  const server=http.createServer(async(req,res)=>{
    try{
      const boundPort=server.address()?.port||port;
      if(!['127.0.0.1:'+boundPort,'localhost:'+boundPort].includes(req.headers.host))
        return reply(res,403,{error:'local_host_only'});
      const url=new URL(req.url,'http://127.0.0.1:'+boundPort);
      if(req.method!=='GET'){
        if(req.headers.origin&&!['http://127.0.0.1:'+boundPort,'http://localhost:'+boundPort].includes(req.headers.origin))
          return reply(res,403,{error:'foreign_origin'});
        if(req.headers['x-fallen-token']!==token)return reply(res,403,{error:'local_token_required'});
      }
      if(req.method==='GET'&&url.pathname==='/'){
        const html=fs.readFileSync(path.join(HERE,'founder-desk.html'),'utf8')
          .replace('__FALLEN_LOCAL_TOKEN__',token);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'none'; connect-src 'self'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
        return res.end(html);
      }
      if(req.method==='GET'&&url.pathname==='/api/jobs')return reply(res,200,{jobs:jobs(root)});
      if(req.method==='POST'&&url.pathname==='/api/jobs'){
        const body=await json(req),id=slug(body.name);
        if(!safeId.test(id))throw Error('invalid_job_name');
        if(fs.existsSync(jobPath(root,id)))return reply(res,409,{error:'job_already_exists'});
        const job=newJob(id,clean(body.name));store(jobPath(root,id),job);return reply(res,201,{job});
      }
      const match=url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/(update|media|rights|assembly|render|packet)$/);
      if(!match)return reply(res,404,{error:'unknown_route'});
      const id=match[1],action=match[2],job=load(jobPath(root,id));
      if(req.method==='GET'&&action==='packet')return reply(res,200,packet(job));
      if(req.method==='POST'&&action==='update'){
        const updated=patchJob(job,await json(req));store(jobPath(root,id),updated);
        return reply(res,200,{readiness:readiness(updated)});
      }
      if(req.method==='POST'&&action==='media'){
        const asset=await ingest(req,root,job,url.searchParams.get('type'),url.searchParams.get('name'));
        return reply(res,201,{asset,readiness:readiness(job)});
      }
      if(req.method==='POST'&&action==='rights'){
        const body=await json(req),asset=job.assets.find(x=>x.id===body.assetId);
        if(!asset)throw Error('asset_not_found');
        if(body.rights!=='reviewed'&&body.rights!=='unreviewed')throw Error('invalid_review_state');
        if(body.rights==='reviewed'&&(!clean(body.evidence)||!clean(body.reviewer)))
          throw Error('rights_evidence_and_reviewer_required');
        asset.rights=body.rights;asset.evidence=clean(body.evidence);
        asset.reviewer=clean(body.reviewer);store(jobPath(root,id),job);
        return reply(res,200,{readiness:readiness(job)});
      }
      if(req.method==='POST'&&action==='assembly'){
        const assembly=await json(req);
        if(assembly?.schema!=='evercraft.fallen.commercial-assembly.v1')
          throw Error('assembly_schema_invalid');
        store(path.join(root,'jobs',id,'approved-assembly.json'),assembly);
        job.approvedAssembly=true;job.technicalRender=null;store(jobPath(root,id),job);
        return reply(res,200,{staged:true,readiness:readiness(job)});
      }
      if(req.method==='POST'&&action==='render'){
        if(busy.has(id))return reply(res,409,{error:'render_in_progress'});
        busy.add(id);
        try{return reply(res,200,await render(root,job));}
        finally{busy.delete(id);}
      }
      return reply(res,405,{error:'method_not_allowed'});
    }catch(e){return reply(res,400,{error:String(e.message||e)});}
  });
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.env.FALLEN_PRIVATE_DESK_DIR||
    path.join(os.homedir(),'.local','share','evercraft','fallen-founder-desk'));
  const port=Number(process.env.FALLEN_FOUNDER_PORT||8793);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid_port');
  makeServer({root,port}).listen(port,'127.0.0.1',()=>{
    process.stdout.write('Fallen Founder Desk: http://127.0.0.1:'+port+'\n');
  });
}
