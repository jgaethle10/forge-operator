// FOREST-005: one bounded, private expansion step. No timer, publishing or dispatch.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const AREAS=Object.freeze({'53007':'Chelan','53017':'Douglas','53025':'Grant','53043':'Lincoln','53063':'Spokane','53001':'Adams','53003':'Asotin','53013':'Columbia','53023':'Garfield','53071':'Walla Walla','53075':'Whitman'});
const YEAR=2025, MAX=32*1024*1024, RETRY=6*3600000;
const digest=b=>createHash('sha256').update(b).digest('hex');
const parser=fileURLToPath(new URL('./qcew-baseline.mjs',import.meta.url));
function privateRoot(root){
 if(!path.isAbsolute(root))throw Error('absolute_private_root_required');
 const p=fs.realpathSync(root),s=fs.lstatSync(root);
 if(p!==path.resolve(root)||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('private_root_hold');
}
function readPrivate(p,max=MAX){
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('private_file_hold');
 const b=fs.readFileSync(fd);if(b.length!==s.size)throw Error('file_changed');return b;}finally{fs.closeSync(fd)}
}
function save(p,b){const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function verify(dir,area){
 const r=JSON.parse(readPrivate(path.join(dir,'receipt.json'),65536));
 const raw=readPrivate(path.join(dir,'source.csv')),parsed=readPrivate(path.join(dir,'baseline.json'));
 const x=JSON.parse(parsed);
 if(r.schema!=='evercraft.forest-005.county-receipt.v1'||r.area!==area||r.year!==YEAR||r.publication_authorized!==false||
 r.raw_sha256!==digest(raw)||r.baseline_sha256!==digest(parsed)||x.source_file_sha256!==r.raw_sha256||
 x.result?.area_fips!==area||x.result?.year!==YEAR||!x.result?.industries?.some(a=>['REPORTED','SUPPRESSED'].includes(a.state)))throw Error('receipt_integrity_hold');
 return r;
}
async function download(area){
 const url='https://data.bls.gov/cew/data/api/'+YEAR+'/a/area/'+area+'.csv';
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000),headers:{'user-agent':'Evercraft Forest Research/1.0','accept':'text/csv'}});
 if(!r.ok||!r.body)throw Error('source_http_'+r.status);
 const chunks=[];let n=0;
 for await(const c of r.body){n+=c.length;if(n>MAX)throw Error('source_limit');chunks.push(Buffer.from(c))}
 return Buffer.concat(chunks);
}
function parse(file,area){
 const p=spawnSync(process.execPath,[parser,'--file',area,String(YEAR),file],{timeout:45000,maxBuffer:1024*1024});
 if(p.status!==0||p.error)throw Error('parser_hold');
 return p.stdout;
}
export async function expandForestOnce({root,now=Date.now(),fetchCounty=download}={}){
 privateRoot(root);if(!Number.isSafeInteger(now)||now<=0)throw Error('invalid_clock');
 const lock=path.join(root,'.growth-lock');
 try{fs.mkdirSync(lock,{mode:0o700})}catch(e){if(e.code==='EEXIST')return {state:'held_busy',new_counties:0,publication_authorized:false};throw e}
 try{
  const completed=[],eligible=[];
  for(const area of Object.keys(AREAS)){
   const dir=path.join(root,area);
   if(fs.existsSync(dir)){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('private_county_hold');verify(dir,area);completed.push(area);continue}
   const hold=path.join(root,area+'.retry.json');
   if(fs.existsSync(hold)){const h=JSON.parse(readPrivate(hold,4096));if(!Number.isSafeInteger(h.at)||h.at>now)throw Error('retry_clock_hold');if(now-h.at<RETRY)continue}
   eligible.push(area);
  }
  const base={schema:'evercraft.forest-005.growth-step.v1',observed_at:new Date(now).toISOString(),verified_counties:completed.length,target_counties:Object.keys(AREAS).length,new_counties:0,publication_authorized:false,execution_scope:'private_payroll_research_only'};
  if(!eligible.length)return {...base,state:completed.length===Object.keys(AREAS).length?'coverage_complete':'retry_wait'};
  const area=eligible[0],tmp=fs.mkdtempSync(path.join(root,'.stage-'));fs.chmodSync(tmp,0o700);
  try{
   const raw=await fetchCounty(area);if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>MAX)throw Error('source_size_hold');
   save(path.join(tmp,'source.csv'),raw);
   const parsed=parse(path.join(tmp,'source.csv'),area);
   save(path.join(tmp,'baseline.json'),parsed);
   const receipt={schema:'evercraft.forest-005.county-receipt.v1',area,year:YEAR,source_url:'https://data.bls.gov/cew/data/api/'+YEAR+'/a/area/'+area+'.csv',observed_at:base.observed_at,raw_sha256:digest(raw),baseline_sha256:digest(parsed),publication_authorized:false};
   save(path.join(tmp,'receipt.json'),Buffer.from(JSON.stringify(receipt)));
   verify(tmp,area);fs.renameSync(tmp,path.join(root,area));
   return {...base,state:'expanded',verified_counties:completed.length+1,new_counties:1,area,receipt_sha256:digest(Buffer.from(JSON.stringify(receipt)))};
  }catch(e){
   const hold=path.join(root,area+'.retry.json'),staged=path.join(tmp,'retry.json');
   save(staged,Buffer.from(JSON.stringify({at:now})));fs.renameSync(staged,hold);
   return {...base,state:'source_or_validation_hold',area};
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
 }finally{fs.rmdirSync(lock)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--once-private'){console.error('usage: --once-private ABSOLUTE_PRIVATE_DIR');process.exitCode=1}
 else {process.umask(0o077);expandForestOnce({root:process.argv[3]}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('FOREST_GROWTH_HELD');process.exitCode=1})}
}
