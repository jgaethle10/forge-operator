#!/usr/bin/env node
// Private operator-only review. Never run with public or CI production secrets.
// Default list emits references only; named show requires explicit --show-pii.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readPrivatePartnerApplication} from '../systemia/mcp/partners-public-inquiry.mjs';

const folder=process.env.EVERCRAFT_PARTNERS_LEADS_DIR||
 path.join(os.homedir(),'.local','state','evercraft','partner-applications');
const key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'';
const command=process.argv[2]||'list';
if(!fs.existsSync(folder)){
 console.error('Private partners inbox is unavailable. No applications inferred.');
 process.exit(2);
}
if(command==='list'){
 const refs=fs.readdirSync(folder).filter(n=>/^EVP-[A-F0-9]{24}\.enc$/.test(n)).sort()
  .map(n=>n.slice(0,-4));
 console.log(JSON.stringify({schema:'evercraft.partners.private-inbox-index.v1',
  count:refs.length,entries:refs,contains_applicant_pii:false},null,2));
}else if(command==='show'&&process.argv[4]==='--show-pii'&&/^EVP-[A-F0-9]{24}$/.test(process.argv[3]||'')){
 try{
  const item=readPrivatePartnerApplication({storeDir:folder,key,reference:process.argv[3]});
  console.log(JSON.stringify(item,null,2));
 }catch{
  console.error('Cannot verify and decrypt private application.');
  process.exit(2);
 }
}else{
 console.error('Usage: node scripts/partners-owner-inbox.mjs list OR show EVP-REFERENCE --show-pii');
 process.exit(2);
}
