#!/usr/bin/env node
// Local-only, read-only Mission Control observer. Never binds to LAN/public interfaces.
// Serves sanitized summaries of operator-selected files, not raw private records.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildLocalMissionSnapshot} from './mission-control-local-reader.mjs';

const FILES=new Map([
 ['/', ['mission-control.html','text/html; charset=utf-8']],
 ['/mission-control.html',['mission-control.html','text/html; charset=utf-8']],
 ['/mission-control.css',['mission-control.css','text/css; charset=utf-8']],
 ['/mission-control.mjs',['mission-control.mjs','text/javascript; charset=utf-8']],
 ['/mission-source.mjs',['mission-source.mjs','text/javascript; charset=utf-8']],
 ['/work-source.mjs',['work-source.mjs','text/javascript; charset=utf-8']],
 ['/index.html',['index.html','text/html; charset=utf-8']],
 ['/workroom.css',['workroom.css','text/css; charset=utf-8']],
 ['/workroom.mjs',['workroom.mjs','text/javascript; charset=utf-8']],
]);
const VIEW_ROOT=new URL('../../public/live/',import.meta.url);
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.github.com; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";
function headers(extra={}){
 return {
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Content-Security-Policy':CSP,
  ...extra,
 };
}
function write(res,status,body,ctype='text/plain; charset=utf-8'){
 res.writeHead(status,headers({'Content-Type':ctype}));
 res.end(body);
}
export function createLocalMissionControlServer({stateFiles=[],nodeWatches=[],loadSnapshot=null}={}){
 if(!stateFiles.length&&!nodeWatches.length&&!loadSnapshot)throw Error('explicit local source configuration required');
 const getSnapshot=loadSnapshot||(()=>buildLocalMissionSnapshot({stateFiles,nodeWatches}));
 return http.createServer(async(req,res)=>{
  const host=String(req.headers.host||'');
  if(!/^(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(host)){
   write(res,403,'Local-only Host required');return;
  }
  const origin=req.headers.origin;
  if(origin&&!['http://'+host].includes(origin)){
   write(res,403,'Cross-origin requests refused');return;
  }
  if(['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){
   write(res,403,'Cross-site browser requests refused');return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
   write(res,405,'Read-only endpoint');return;
  }
  let url;
  try{url=new URL(req.url,'http://'+host);}catch{write(res,400,'Invalid route');return;}
  if(url.search||url.hash){write(res,400,'Query strings not supported');return;}
  if(url.pathname==='/v1/snapshot'){
   try{
    const snapshot=await getSnapshot();
    if(snapshot?.schema!=='evercraft.systemia.operator-mission-snapshot.v1')throw Error('invalid local snapshot');
    const data=JSON.stringify(snapshot);
    if(data.length>250000)throw Error('snapshot beyond browser bound');
    write(res,200,req.method==='HEAD'?'':data,'application/json; charset=utf-8');
   }catch{
    // No internal paths or private error details escape the endpoint.
    write(res,503,'Local source unavailable or unverified');
   }
   return;
  }
  const match=FILES.get(url.pathname);
  if(!match){write(res,404,'Not found');return;}
  try{
   const data=await readFile(new URL(match[0],VIEW_ROOT));
   write(res,200,req.method==='HEAD'?'':data,match[1]);
  }catch{write(res,503,'Viewer asset unavailable');}
 });
}
function args(argv){
 const cfg={stateFiles:[],nodeWatches:[],port:8766};const nodes={node001:{},node002:{}};
 for(let i=0;i<argv.length;i++){
  const key=argv[i],value=argv[++i];
  if(!value||value.startsWith('--'))throw Error('Missing value for '+key);
  if(key==='--state')cfg.stateFiles.push(value);
  else if(key==='--port'){const p=Number(value);if(!Number.isSafeInteger(p)||p<1024||p>65535)throw Error('Invalid local port');cfg.port=p;}
  else if(/^--node00[12]-(watch|id)$/.test(key)){
   const [,slot,field]=key.match(/^--(node00[12])-(watch|id)$/);
   if(nodes[slot][field])throw Error('Duplicate node argument');
   nodes[slot][field]=value;
  }else throw Error('Unknown argument '+key);
 }
 for(const [nodeKey,n] of Object.entries(nodes)){
  if(n.watch||n.id){
   if(!n.watch||!n.id)throw Error('Watch file and exact node ID required together');
   cfg.nodeWatches.push({nodeKey,file:n.watch,expectedNodeId:n.id});
  }
 }
 if(cfg.stateFiles.length>80||!cfg.stateFiles.length&&!cfg.nodeWatches.length)throw Error('Choose explicit local goal or node watch files');
 return cfg;
}
const isCli=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(isCli){
 try{
  const cfg=args(process.argv.slice(2));
  const server=createLocalMissionControlServer(cfg);
  server.listen(cfg.port,'127.0.0.1',()=>{
   process.stdout.write('SYSTEMIA LOCAL OBSERVER: http://127.0.0.1:'+cfg.port+'/mission-control.html\nRead-only. Local source claims unverified; no remote ingress or execution granted.\n');
  });
  server.on('error',e=>{process.stderr.write('MISSION_CONTROL_HELD: '+e.message+'\n');process.exitCode=1;});
 }catch(e){process.stderr.write('MISSION_CONTROL_HELD: '+e.message+'\n');process.exitCode=1;}
}
