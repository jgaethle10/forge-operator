// Optional observation only, on the existing company heartbeat. The synthetic
// pilot has no production authority, even when this receipt is valid.
import {EngineeringFencePilot} from '../execution-gate/engineering-fence-pilot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const base={synthetic:true,execution_authorized:false,production_authorized:false,release_authorized:false,worker_dispatched:false};
export function observeEngineeringPilot({root,now=new Date()}={}){
 if(!root)return {state:'not_admitted',...base};
 try{
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('absolute_pilot_root_required');
  const file=path.join(root,'fence.json'),s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>1024*1024)throw Error('private_pilot_state_required');
  const pilot=new EngineeringFencePilot({root,clock:()=>+now});
  const observation=pilot.observe();
  const {receipt_hash,...body}=observation;
  if(receipt_hash!==sha(body)||observation.synthetic!==true||observation.execution_authorized!==false)throw Error('pilot_receipt_invalid');
  const record={schema:'evercraft.kaidance.engineering-pilot-observation.v1',state:'observed_synthetic',tick:Math.floor(+now/300000),observed_at:new Date(now).toISOString(),observation,...base};
  return {...record,receipt_hash:sha(record)};
 }catch{return {state:'held',reason:'pilot_source_missing_or_invalid',...base};}
}
