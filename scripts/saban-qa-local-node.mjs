#!/usr/bin/env node
// Operator-local only. No remote tunnel, network auto-discovery, deployment or secret upload.
import fs from 'node:fs';
import path from 'node:path';
import {probeOperatorQaNode,executeOperatorLocalQa,normalizeLocalQaEndpoint} from '../systemia/saban/qa-local-node.mjs';
const args=new Map(process.argv.slice(2).filter(a=>a.startsWith('--')&&a.includes('=')).map(a=>{
 const at=a.indexOf('=');return [a.slice(2,at),a.slice(at+1)]
}));
const has=flag=>process.argv.includes('--'+flag);
const endpoint=args.get('endpoint'),node=args.get('node'),pin=args.get('pin');
const tokenFile=args.get('token-file'),out=args.get('out');
if(!endpoint||!node||!pin||!tokenFile){
 console.error('usage: node scripts/saban-qa-local-node.mjs --endpoint=http://127.0.0.1:PORT --node=TRUSTED_ID --pin=TRUSTED_FINGERPRINT --token-file=/private/token [--operator-approved] [--execute] [--roles=work_saban_checker] [--out=/private/receipt.json]');
 process.exit(2);
}
try{normalizeLocalQaEndpoint(endpoint)}catch(e){console.error('Endpoint rejected:',e.message);process.exit(2)}
let token;
try{
 const stat=fs.lstatSync(tokenFile);
 if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o077)!==0||stat.size>1024){
  throw Error('token_file_must_be_private_regular_file');
 }
 token=fs.readFileSync(tokenFile,'utf8').trim();
 if(!/^[^\s]{16,512}$/.test(token))throw Error('allocator_token_invalid');
}catch(e){console.error('Token unavailable:',e.message);process.exit(2)}
const approved=has('operator-approved'),execute=has('execute');
if(execute&&!approved){console.error('Execution requires explicit operator approval');process.exit(2)}
if(execute&&process.env.GITHUB_ACTIONS==='true'){console.error('Hosted CI may not run physical-node QA');process.exit(2)}
const roles=(args.get('roles')||'work_saban_checker').split(',').map(s=>s.trim());
try{
 const report=execute
  ?await executeOperatorLocalQa({endpoint,expectedNodeId:node,expectedFingerprint:pin,operatorApproved:approved,allocatorToken:token,roles,execute:true})
  :(await probeOperatorQaNode({endpoint,expectedNodeId:node,expectedFingerprint:pin,operatorApproved:approved,allocatorToken:token})).report;
 if(out){
  const destination=path.resolve(out);
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 console.log(JSON.stringify(report,null,2));
 const good=execute?report.state==='passed_local_qa_not_hardware_certified':report.state==='signed_loopback_candidate';
 if(!good)process.exitCode=1;
}catch(error){
 console.error('QA execution held:',String(error?.message||error).slice(0,180));
 process.exitCode=1;
}
