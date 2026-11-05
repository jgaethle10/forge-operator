// Owned Worlds edge-route management. Dry-run by default. No DNS, TLS or shared route changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectWorldsEdge,reconcileWorldsRoute,WORLDS_ROUTE_SCHEMA} from '../systemia/worlds/worlds-edge-route.mjs';
const args=process.argv.slice(2);
const flag=name=>{const i=args.indexOf('--'+name);return i<0?'':args[i+1]||'';};
const active=args.includes('--reconcile');
const control=flag('edge-control')||'http://127.0.0.1:18081';
const vault=flag('vault')||'http://127.0.0.1:8788';
const origin=flag('public-origin');
const instance=flag('deployment-instance');
const receiptHash=flag('deployment-receipt-hash');
const root=process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local/state');
const stateFile=path.join(root,'evercraft/worlds-edge/owned-worlds-route.json');
async function main(){
 const params={edgeControlUrl:control,vaultUrl:vault,publicOrigin:origin,
  controlToken:process.env.EVERCRAFT_EDGE_CONTROL_TOKEN||'',
  deploymentReceiptHash:receiptHash,instanceId:instance};
 const inspected=await inspectWorldsEdge(params);
 if(!active){console.log(JSON.stringify({...inspected,action:'dry_run',public_edge_modified:false}));return;}
 let previous=null;
 try{previous=JSON.parse(await fs.readFile(stateFile,'utf8'));}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const receipt=await reconcileWorldsRoute({...params,previousLease:previous});
 if(receipt.schema!==WORLDS_ROUTE_SCHEMA||receipt.proof_only||receipt.external_https_verified!==false)throw Error('worlds_edge_receipt_unsafe');
 const destination=path.dirname(stateFile);
 await fs.mkdir(destination,{recursive:true,mode:0o700});
 const temp=stateFile+'.'+process.pid+'.tmp';
 try{
  await fs.writeFile(temp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  await fs.rename(temp,stateFile);
 }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 console.log(JSON.stringify({action:receipt.action,lease_id:receipt.lease_id,expires_at:receipt.expires_at,
  receipt_path:stateFile,external_https_verified:false,public_edge_modified:true}));
}
main().catch(e=>{console.error('HOLD:',e.message);process.exitCode=1;});
