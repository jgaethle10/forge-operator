#!/usr/bin/env node
// Operator-local read-only triage. Do not upload capacity JSON to CI.
import fs from 'node:fs';
import {assessPortfolioQaDeviceCapacity} from '../systemia/saban/qa-device-admission.mjs';
const arg=name=>{
 const key='--'+name+'=';
 return process.argv.find(v=>v.startsWith(key))?.slice(key.length)||'';
};
const file=arg('capacity'),node=arg('node'),pin=arg('pin');
if(!file||!node||!pin){
 console.error('usage: node scripts/saban-qa-device-admission.mjs --capacity=/private/capacity.json --node=TRUSTED_NODE_ID --pin=KNOWN_64_HEX_FINGERPRINT [--operator-approved]');
 process.exit(2);
}
let raw;
try{raw=JSON.parse(fs.readFileSync(file,'utf8'))}
catch{console.error('invalid local capacity file');process.exit(2)}
const result=assessPortfolioQaDeviceCapacity({
 capacity:raw,expectedNodeId:node,expectedFingerprint:pin,
 operatorApproved:process.argv.includes('--operator-approved'),now:new Date(),
});
console.log(JSON.stringify(result,null,2));
if(result.state!=='candidate_for_private_pairing')process.exitCode=1;
