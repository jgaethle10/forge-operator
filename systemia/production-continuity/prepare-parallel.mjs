#!/usr/bin/env node
// Prepare all authorized lanes on an owned private node. No agent dispatch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildParallelSlate } from './parallel-slate.mjs';

const args=process.argv.slice(2);
const arg=key=>{const pos=args.indexOf(key);return pos<0?null:args[pos+1];};
try {
 const root=path.resolve(arg('--private-dir')||path.join(os.homedir(),'.local/share/evercraft/production-continuity'));
 if(args.includes('--private-dir')&&!path.isAbsolute(arg('--private-dir')))throw Error('Private dir must be absolute');
 let p=root;
 while(p!==path.dirname(p)){if(fs.existsSync(path.join(p,'.git')))throw Error('Source checkout cannot hold private slate');p=path.dirname(p);}
 const directory=fs.lstatSync(root);
 if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077))throw Error('Private dir must be owner only (0700)');
 const source=path.join(root,'ledger.json');
 const stat=fs.lstatSync(source);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Private ledger must be owner only (0600)');
 const ledger=JSON.parse(fs.readFileSync(source,'utf8'));
 const count=arg('--max-in-flight')===null?6:Number(arg('--max-in-flight'));
 const batch=buildParallelSlate(ledger,{maxInFlight:count});
 const dest=path.join(root,'parallel-slate.json');
 fs.writeFileSync(dest,JSON.stringify(batch,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
 console.log(JSON.stringify({queued:batch.queued_count,held:batch.held_count,max_in_flight:batch.max_in_flight,agents_running:false,workers_attached:false,dispatch_performed:false}));
} catch(error){console.error('Private fan-out preparation refused: '+(error?.message||'unknown error'));process.exitCode=1;}
