#!/usr/bin/env node
// Evercraft Fallen: PRIVATE loopback-only video review. No new media or publication.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readTimelineVersionHistory,readTimelineVersion} from './timeline-version-vault.mjs';

export const PREVIEW_DESK_SCHEMA='evercraft.fallen.private-preview-desk.v1';
export const PREVIEW_NOTE_SCHEMA='evercraft.fallen.preview-revision-note.v1';
const SHA=/^[0-9a-f]{64}$/;
const MAX_MEDIA_BYTES=1024*1024*1024;
const MAX_NOTE_BYTES=2048;
const clean=s=>typeof s==='string'?s.trim():'';
const appDir=path.dirname(fileURLToPath(import.meta.url));
function regular(file){
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('fallen_preview_unsafe_file');
  return stat;
}
function privateDirectory(file,{create=false}={}){
  if(create&&!fs.existsSync(file))fs.mkdirSync(file,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('fallen_preview_unsafe_directory');
}
function checksum(file){
  const fd=fs.openSync(file,'r');
  const hash=crypto.createHash('sha256'),buff=Buffer.allocUnsafe(512*1024);
  try{for(;;){const n=fs.readSync(fd,buff,0,buff.length,null);if(!n)break;hash.update(buff.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
function mediaPath(mediaRoot,relative){
  if(!clean(relative)||path.isAbsolute(relative))throw Error('fallen_preview_media_path_invalid');
  const root=path.resolve(mediaRoot),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))throw Error('fallen_preview_media_outside_private_root');
  privateDirectory(root);
  // Refuse symlinks in every component, not just the target.
  let check=root;
  for(const part of path.relative(root,file).split(path.sep)){
    check=path.join(check,part);
    if(fs.lstatSync(check).isSymbolicLink())throw Error('fallen_preview_media_symlink_rejected');
  }
  if(path.extname(file).toLowerCase()!=='.mp4')throw Error('fallen_preview_requires_mp4');
  return file;
}
function verifyMedia(file,expectedSha){
  const stat=regular(file);
  if(stat.size<12||stat.size>MAX_MEDIA_BYTES)throw Error('fallen_preview_media_size_invalid');
  const fd=fs.openSync(file,'r'),header=Buffer.alloc(12);
  try{fs.readSync(fd,header,0,12,0);}finally{fs.closeSync(fd);}
  if(header.subarray(4,8).toString('ascii')!=='ftyp')throw Error('fallen_preview_media_not_mp4');
  if(checksum(file)!==expectedSha)throw Error('fallen_preview_media_digest_mismatch');
  return {size:stat.size};
}
/** Operator attestation is not authentication or independent license validation. */
export function preparePreviewDesk({vaultRoot,mediaRoot,notesRoot,manifest}){
  if(manifest?.schema!==PREVIEW_DESK_SCHEMA||!clean(manifest.projectId)||
     !Array.isArray(manifest.previews)||!manifest.previews.length||manifest.previews.length>20)
    throw Error('fallen_preview_manifest_invalid');
  privateDirectory(path.resolve(notesRoot),{create:true});
  const history=readTimelineVersionHistory({root:vaultRoot,projectId:manifest.projectId});
  const known=new Map(history.entries.map(e=>[e.projectDigest,e]));
  const digests=new Set();
  const previews=manifest.previews.map((v,index)=>{
    if(!SHA.test(v?.projectDigest||'')||!SHA.test(v?.mediaSha256||'')||
       !known.has(v.projectDigest)||digests.has(v.projectDigest)||
       v.privateReviewAuthorized!==true||!clean(v.reviewAuthorityReference).startsWith('private:')||
       clean(v.label).length<1||clean(v.label).length>80)
      throw Error('fallen_preview_version_not_authorized');
    digests.add(v.projectDigest);
    const project=readTimelineVersion({root:vaultRoot,projectId:manifest.projectId,
      projectDigest:v.projectDigest});
    const file=mediaPath(mediaRoot,v.relativeMediaPath);
    verifyMedia(file,v.mediaSha256);
    return {index,version:project.version,digest:v.projectDigest,
      label:clean(v.label),file,mediaSha256:v.mediaSha256};
  });
  return {schema:PREVIEW_DESK_SCHEMA,projectId:manifest.projectId,
    previews,notesRoot:path.resolve(notesRoot),vaultRoot:path.resolve(vaultRoot),
    boundaries:{loopbackOnly:true,publicHosting:false,
      privateReviewRightsOperatorAttested:true,generatedMedia:false,
      publicationAuthority:false,paymentAuthority:false}};
}
function send(res,status,payload,type='application/json'){
  const body=typeof payload==='string'?payload:JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),
    'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});
  res.end(body);
}
function noteBody(req){
  return new Promise((resolve,reject)=>{
    let size=0,tooBig=false;const parts=[];
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>MAX_NOTE_BYTES){tooBig=true;parts.length=0;}
      else if(!tooBig)parts.push(chunk);
    });
    req.on('end',()=>{
      if(tooBig)return reject(Error('fallen_preview_note_too_large'));
      try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}
      catch{reject(Error('fallen_preview_note_invalid'));}
    });
    req.on('error',reject);
  });
}
function saveNote(desk,body){
  if(!Number.isSafeInteger(body?.index)||!SHA.test(body?.expectedProjectDigest||''))
    throw Error('fallen_preview_note_version_invalid');
  const item=desk.previews.find(v=>v.index===body.index);
  if(!item||item.digest!==body.expectedProjectDigest)
    throw Error('fallen_preview_note_version_stale');
  const note=clean(body.note);
  if(note.length<12||note.length>800)throw Error('fallen_preview_note_text_invalid');
  const stillThere=readTimelineVersion({root:desk.vaultRoot,projectId:desk.projectId,
    projectDigest:item.digest});
  if(stillThere.version!==item.version)throw Error('fallen_preview_note_project_changed');
  privateDirectory(desk.notesRoot);
  const id=crypto.randomUUID();
  const packet={schema:PREVIEW_NOTE_SCHEMA,projectId:desk.projectId,
    projectVersion:item.version,projectDigest:item.digest,mediaSha256:item.mediaSha256,
    note,createdAt:new Date().toISOString(),id,
    state:'PRIVATE_OPERATOR_REVIEW_REQUIRED',sabanExecution:false,
    videoEdited:false,clientApproved:false,published:false,paymentRequested:false};
  fs.writeFileSync(path.join(desk.notesRoot,'review-'+id+'.json'),
    JSON.stringify(packet,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {status:'PRIVATE_NOTE_RECORDED',id};
}
const readAsset=name=>fs.readFileSync(path.join(appDir,name),'utf8');
function html(route){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Fallen | Private Review</title><link rel="stylesheet" href="'+route+'/private-preview.css"></head>'+
  '<body><main><header><small>EVERCRAFT / FALLEN STUDIOS · PRIVATE REVIEW</small>'+
  '<h1>Watch it. Shape it.</h1><p>Compare approved preview files and describe one change in your own words.</p></header>'+
  '<section aria-label="Existing video previews"><div class="versions" id="versions"></div>'+
  '<video controls playsinline preload="metadata" id="preview" aria-label="Selected private video preview"></video>'+
  '<p class="hint" id="selected"></p></section><section class="panel">'+
  '<form id="revision"><label for="note">What should we change?</label>'+
  '<textarea id="note" minlength="12" maxlength="800" required placeholder="Keep the opening. Change the ending to feel more exciting."></textarea>'+
  '<div class="actions"><button class="submit" id="send" type="submit">Save revision request</button>'+
  '<small>No AI generation, charge or publication occurs here.</small></div></form>'+
  '<p id="message" role="status" aria-live="polite"></p></section>'+
  '<p class="hint">Private operator review. Media stays on this device. A recorded note is not an accepted revision or finished film.</p>'+
  '</main><script src="'+route+'/private-preview.js" defer></script></body></html>';
}
/** Loopback only; URL is a local bearer capability, not customer authentication. */
export async function startPreviewDesk({vaultRoot,mediaRoot,notesRoot,manifest,port=0}){
  const desk=preparePreviewDesk({vaultRoot,mediaRoot,notesRoot,manifest});
  const token=crypto.randomBytes(24).toString('hex');
  const route='/session/'+token;
  const server=http.createServer(async(req,res)=>{
    const localPort=server.address()?.port;
    const origin='http://127.0.0.1:'+localPort;
    const location=new URL(req.url||'/',origin);
    const pathname=location.pathname.replace(/\/$/,'');
    if(pathname!==route&&!pathname.startsWith(route+'/'))return send(res,404,{error:'not_found'});
    if(req.method==='GET'&&pathname===route){
      const body=html(route);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Content-Length':Buffer.byteLength(body),
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'Referrer-Policy':'no-referrer','Cache-Control':'no-store',
        'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'});
      return res.end(body);
    }
    if(req.method==='GET'&&pathname===route+'/private-preview.js')
      return send(res,200,readAsset('private-preview.js'),'text/javascript; charset=utf-8');
    if(req.method==='GET'&&pathname===route+'/private-preview.css')
      return send(res,200,readAsset('private-preview.css'),'text/css; charset=utf-8');
    if(req.method==='GET'&&pathname===route+'/versions'){
      return send(res,200,{schema:PREVIEW_DESK_SCHEMA,
        previews:desk.previews.map(v=>({index:v.index,version:v.version,
          label:v.label,projectDigest:v.digest}))});
    }
    if((req.method==='GET'||req.method==='HEAD')&&pathname.startsWith(route+'/media/')){
      const match=/^\/media\/(\d+)$/.exec(pathname.slice(route.length));
      const item=match?desk.previews.find(v=>v.index===Number(match[1])):null;
      if(!item)return send(res,404,{error:'media_not_found'});
      try{
        const {size}=verifyMedia(item.file,item.mediaSha256);
        const input=req.headers.range;
        let start=0,end=size-1;
        if(input){
          const m=/^bytes=(\d*)-(\d*)$/.exec(input);
          if(!m||(!m[1]&&!m[2]))throw Error('invalid_range');
          if(!m[1])start=Math.max(0,size-Number(m[2]));
          else start=Number(m[1]);
          if(m[1]&&m[2])end=Number(m[2]);
          if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
            start>=size||end<start||end>=size)throw Error('invalid_range');
        }
        res.writeHead(input?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes',
          'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
          'Content-Length':String(end-start+1),'X-Content-Type-Options':'nosniff',
          ...(input?{'Content-Range':'bytes '+start+'-'+end+'/'+size}:{})});
        if(req.method==='HEAD')return res.end();
        fs.createReadStream(item.file,{start,end}).on('error',()=>res.destroy()).pipe(res);
      }catch{return send(res,416,{error:'media_unavailable_or_invalid_range'});}
      return;
    }
    if(req.method==='POST'&&pathname===route+'/notes'){
      if(req.headers.origin!==origin||
        req.headers['x-fallen-review']!=='local-action'||
        !/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
        return send(res,403,{error:'cross_origin_or_content_type_rejected'});
      try{return send(res,201,saveNote(desk,await noteBody(req)));}
      catch{return send(res,400,{error:'invalid_review_note'});}
    }
    return send(res,404,{error:'not_found'});
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return {schema:PREVIEW_DESK_SCHEMA,url:'http://127.0.0.1:'+server.address().port+route,
    projectId:desk.projectId,previewCount:desk.previews.length,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
async function main(){
  const [manifestFile,vaultRoot,mediaRoot,notesRoot]=process.argv.slice(2);
  if(!manifestFile||!vaultRoot||!mediaRoot||!notesRoot)
    throw Error('Usage: node private-preview-desk.mjs <private-manifest.json> <vault-root> <media-root> <notes-root>');
  const stat=regular(path.resolve(manifestFile));
  if(stat.size>16000)throw Error('fallen_preview_manifest_too_large');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const desk=await startPreviewDesk({manifest,vaultRoot,mediaRoot,notesRoot});
  console.log(JSON.stringify({status:'PRIVATE_LOOPBACK_REVIEW_READY',url:desk.url,
    projectId:desk.projectId,previewCount:desk.previewCount,publicHosting:false,
    generatedMedia:false,publishingAuthority:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
