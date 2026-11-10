#!/usr/bin/env node
// Private local Circles founding-interest operator review. No network calls.
// Never run with production secrets in shared CI logs or public terminals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readPrivateCirclesInterest} from '../systemia/circles/founding-intake.mjs';

const folder=process.env.EVERCRAFT_CIRCLES_LEADS_DIR||
 path.join(os.homedir(),'.local','state','evercraft','circles-founding-interest');
const key=process.env.EVERCRAFT_CIRCLES_INTAKE_KEY_B64||'';
const command=process.argv[2]||'list';
function privateDirectory(){
 const stat=fs.lstatSync(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
  throw Error('private_circles_folder_not_safe');
}
try{privateDirectory()}catch{
 console.error('Private Circles inbox unavailable. No applications inferred.');
 process.exit(2);
}
if(command==='list'){
 const entries=fs.readdirSync(folder).filter(n=>/^EVC-[A-F0-9]{24}\.enc$/.test(n))
  .sort().map(n=>n.slice(0,-4));
 console.log(JSON.stringify({schema:'evercraft.circles.private-inbox-index.v1',
  count:entries.length,references:entries,contains_applicant_pii:false},null,2));
}else if(command==='show'&&process.argv[4]==='--show-pii'&&/^EVC-[A-F0-9]{24}$/.test(process.argv[3]||'')){
 try{
  const item=readPrivateCirclesInterest({storeDir:folder,key,reference:process.argv[3]});
  console.log(JSON.stringify(item,null,2));
 }catch{
  console.error('Cannot verify or decrypt private founding interest.');
  process.exit(2);
 }
}else{
 console.error('Usage: node scripts/circles-owner-inbox.mjs list OR show EVC-REFERENCE --show-pii');
 process.exit(2);
}
