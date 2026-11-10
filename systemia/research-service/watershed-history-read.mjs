#!/usr/bin/env node
// Read/verify immutable Yakima source history; strictly no report publication.
import {readdirSync,existsSync,readFileSync,lstatSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {makeHistoryReceipt,buildDailyHistory,HISTORY_SOURCES,HISTORY_MAX_BYTES} from './watershed-history.mjs';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const isDay=value=>typeof value==='string'&&DAY.test(value)&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function safeFile(file,maxSize=HISTORY_MAX_BYTES){
  if(!existsSync(file)||!lstatSync(file).isFile()||statSync(file).size>maxSize)
    throw new TypeError('expected regular bounded archive file is missing or unsafe');
  return readFileSync(file);
}
function loadOne(directory,day,runId){
  if(!/^[1-9][0-9]{4,17}$/.test(runId)||!lstatSync(directory).isDirectory())
    throw new TypeError('archive run directory invalid');
  const bytes=safeFile(join(directory,'receipt.json'),HISTORY_MAX_BYTES);
  let saved;
  try{saved=JSON.parse(bytes.toString('utf8'));}catch{throw new TypeError('invalid archived receipt JSON');}
  if(saved.source_run_id!==runId||saved.collection_day_utc!==day||
     saved.key!==day+'/'+runId||
     !saved.source_digests||typeof saved.source_digests!=='object')
    throw new TypeError('receipt path or source run identity mismatch');
  const sourceDir=join(directory,'sources');
  if(!existsSync(sourceDir)||!lstatSync(sourceDir).isDirectory())
    throw new TypeError('source evidence directory missing');
  const storedNames=readdirSync(sourceDir).sort();
  const expected=Object.keys(saved.source_digests).sort();
  if(storedNames.length===0||storedNames.length>HISTORY_SOURCES.length||
    JSON.stringify(storedNames)!==JSON.stringify(expected)||
    expected.some(x=>!HISTORY_SOURCES.includes(x)))
    throw new TypeError('archived raw source inventory changed');
  const raw={};
  for(const name of storedNames)raw[name]=safeFile(join(sourceDir,name));
  const reconstructed=makeHistoryReceipt(raw,{
    runId,headSha:saved.source_head_sha,event:saved.source_event,ingestedAt:saved.ingested_at
  });
  if(JSON.stringify(reconstructed)!==JSON.stringify(saved))
    throw new TypeError('source fingerprints or receipt projection changed');
  return saved;
}
export function readVerifiedHistory(ledgerDir,{asOf,windowDays=7}={}){
  if(typeof ledgerDir!=='string'||!ledgerDir.trim()||!isDay(asOf)||![7,30,90].includes(windowDays))
    throw new TypeError('valid ledger root, UTC day and 7/30/90-day window required');
  const root=resolve(ledgerDir);
  const receipts=[];
  const now=Date.parse(asOf+'T00:00:00Z');
  for(let i=0;i<windowDays;i++){
    const day=new Date(now-i*86400000).toISOString().slice(0,10);
    const [year,month,date]=day.split('-');
    const dir=join(root,'runs',year,month,date);
    if(!existsSync(dir))continue;
    if(!lstatSync(dir).isDirectory())throw new TypeError('archive day path unsafe');
    const entries=readdirSync(dir,{withFileTypes:true});
    if(entries.length>30)throw new RangeError('too many source runs for one UTC day');
    for(const entry of entries){
      if(!entry.isDirectory())throw new TypeError('unexpected archived run entry');
      receipts.push(loadOne(join(dir,entry.name),day,entry.name));
    }
  }
  const projection=buildDailyHistory(receipts,{asOf,windowDays});
  return {
    ...projection,
    verified_run_count:receipts.length,
    raw_digests_verified:true,
    public_release_authorized:false,
    source_only_history:true
  };
}
function parseOptions(argv){
  const args={};
  if(argv.length%2!==0)throw new TypeError('paired arguments required');
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i],v=argv[i+1];
    if(!['--ledger-dir','--as-of','--window-days'].includes(k)||!v||Object.hasOwn(args,k))
      throw new TypeError('unexpected history read option');
    args[k]=v;
  }
  if(!args['--ledger-dir']||!args['--as-of']||!args['--window-days'])
    throw new TypeError('ledger dir, as-of UTC day and window days required');
  return args;
}
if(process.argv[1]?.endsWith('/watershed-history-read.mjs')){
  try{
    const opts=parseOptions(process.argv.slice(2));
    const result=readVerifiedHistory(opts['--ledger-dir'],{
      asOf:opts['--as-of'],windowDays:Number(opts['--window-days'])
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    process.stderr.write('Watershed history readback held: '+String(error?.message||error).slice(0,170)+'\n');
    process.exitCode=1;
  }
}
