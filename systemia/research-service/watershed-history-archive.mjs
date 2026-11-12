#!/usr/bin/env node
// Operator archive writer for a SEPARATE append-only evidence branch.
// Never modifies public/watershed, customer content, payments, or Sentinel incidents.
import {
  existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,lstatSync
} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {makeHistoryReceipt,HISTORY_SOURCES,sha256} from './watershed-history.mjs';

function argsOf(argv){
  const opts={};
  if(argv.length%2!==0)throw new TypeError('paired CLI arguments required');
  const allowed=['--source-dir','--ledger-dir','--run-id','--head-sha','--event'];
  for(let i=0;i<argv.length;i+=2){
    const [key,value]=argv.slice(i,i+2);
    if(!allowed.includes(key)||!value||Object.hasOwn(opts,key))throw new TypeError('unknown or repeated CLI option');
    opts[key]=value;
  }
  if(allowed.some(key=>!opts[key]))throw new TypeError('all five CLI options required');
  return opts;
}
export function archiveWatershedRun({sourceDir,ledgerDir,runId,headSha,event,ingestedAt}){
  if(typeof sourceDir!=='string'||typeof ledgerDir!=='string'||
     !sourceDir.trim()||!ledgerDir.trim())throw new TypeError('source and ledger directories required');
  const source=resolve(sourceDir),ledger=resolve(ledgerDir);
  if(source===ledger||ledger.startsWith(source+'/')||source.startsWith(ledger+'/'))
    throw new TypeError('source and ledger directories cannot overlap');
  const bytes={};
  for(const name of HISTORY_SOURCES){
    const file=join(source,name);
    if(!existsSync(file))continue;
    if(!lstatSync(file).isFile())throw new TypeError('source must be a regular file');
    const data=readFileSync(file);
    if(data.length===0)continue;
    bytes[name]=data;
  }
  const receipt=makeHistoryReceipt(bytes,{runId,headSha,event,ingestedAt});
  const [year,month,day]=receipt.collection_day_utc.split('-');
  const destination=join(ledger,'runs',year,month,day,receipt.source_run_id);
  const output={
    schema:'evercraft.watershed.archive-operation.v1',
    destination:destination.slice(ledger.length+1),
    source_run_id:receipt.source_run_id,source_day_utc:receipt.collection_day_utc,
    source_count:receipt.archived_sources.length,
    action:'new_immutable_entry',publication_authorized:false
  };
  if(existsSync(destination)){
    if(!lstatSync(destination).isDirectory())throw new TypeError('run path collision');
    const existing=JSON.parse(readFileSync(join(destination,'receipt.json'),'utf8'));
    if(existing.schema!==receipt.schema||existing.source_run_id!==receipt.source_run_id||
       existing.source_head_sha!==receipt.source_head_sha||
       JSON.stringify(existing.source_digests)!==JSON.stringify(receipt.source_digests))
      throw new Error('immutable run ID collision: different source data');
    for(const [name,digest] of Object.entries(receipt.source_digests)){
      const stored=join(destination,'sources',name);
      if(!existsSync(stored)||sha256(readFileSync(stored))!==digest)
        throw new Error('archived source has been altered: '+name);
    }
    return {...output,action:'already_recorded_unchanged'};
  }
  const parent=dirname(destination);
  mkdirSync(parent,{recursive:true});
  const temp=destination+'.pending-'+process.pid;
  if(existsSync(temp))throw new Error('concurrent archive temp collision');
  mkdirSync(join(temp,'sources'),{recursive:true});
  try{
    for(const name of receipt.archived_sources)
      writeFileSync(join(temp,'sources',name),bytes[name],{flag:'wx',mode:0o644});
    writeFileSync(join(temp,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o644});
    renameSync(temp,destination);
  }catch(error){
    rmSync(temp,{recursive:true,force:true});
    throw error;
  }
  return output;
}
if(process.argv[1]&&process.argv[1].endsWith('/watershed-history-archive.mjs')){
  try{
    const opts=argsOf(process.argv.slice(2));
    const result=archiveWatershedRun({
      sourceDir:opts['--source-dir'],ledgerDir:opts['--ledger-dir'],
      runId:opts['--run-id'],headSha:opts['--head-sha'],event:opts['--event']
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    process.stderr.write('Watershed evidence archive held: '+String(error?.message||error).slice(0,190)+'\n');
    process.exitCode=1;
  }
}
