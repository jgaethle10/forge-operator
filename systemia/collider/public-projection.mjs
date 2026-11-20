// Explicit, narrow public export from the *existing* privacy-safe KAIDANCE pulse.
// Never accept raw runtime state, mission snapshots, evidence refs, or node topology.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertPulsePrivacy} from './pulse.mjs';

export const PUBLIC_SCHEMA='evercraft.kaidance.public-pulse.v1';
const ALLOWED_STATES=new Set(['healthy','degraded','starting']);
function safeTime(input,field,now){
  if(typeof input!=='string')throw Error(field+'_missing');
  const parsed=Date.parse(input);
  if(!Number.isFinite(parsed)||parsed>now.getTime()+60_000)throw Error(field+'_invalid');
  return new Date(parsed).toISOString();
}
function safeCount(value,field){
  if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)throw Error(field+'_invalid');
  return value;
}
export function projectPublicKaidancePulse(pulse,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('clock_invalid');
 if(!pulse||pulse.schema!=='evercraft.kaidance.pulse.v1')throw Error('approved_safe_pulse_required');
 // The existing boundary must also pass, but is *not* treated as authorization to publish.
 assertPulsePrivacy(pulse);
 if(!ALLOWED_STATES.has(pulse.state))throw Error('pulse_state_invalid');
 const observed=safeTime(pulse.observed_at,'observed_at',now);
 const last=pulse.last_completed_cycle===null?null:safeTime(pulse.last_completed_cycle,'last_cycle',now);
 const cycle=safeCount(pulse.cycle_number,'cycle_number');
 if(cycle>0&&!last)throw Error('missing_last_cycle');
 const seconds=safeCount(pulse.heartbeat_target_seconds,'heartbeat_target_seconds');
 if(seconds<60||seconds>3600)throw Error('heartbeat_target_invalid');
 if(typeof pulse.coverage_receipt_valid!=='boolean')throw Error('coverage_receipt_state_invalid');
 return {
   schema:PUBLIC_SCHEMA,
   state:pulse.state,
   cycle_number:cycle,
   last_completed_cycle:last,
   heartbeat_target_seconds:seconds,
   admitted_count:safeCount(pulse.admitted_count,'admitted_count'),
   held_count:safeCount(pulse.held_count,'held_count'),
   coverage_receipt_valid:pulse.coverage_receipt_valid,
   field_attestation_verified:pulse.field_attestation?.state==='verified',
   observed_at:observed,
   published_at:now.toISOString()
 };
}
function flag(name){
 const idx=process.argv.indexOf(name);
 return idx>=0?process.argv[idx+1]:null;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=flag('--input'),output=flag('--output'),approval=flag('--approval-ref');
 if(!input||!output||!approval||!/^approved:[a-z0-9][a-z0-9:._-]{5,100}$/i.test(approval)){
   console.error('usage: node systemia/collider/public-projection.mjs --input /private/safe-pulse.json --output /approved-export-dir/pulse.json --approval-ref approved:<operator-record>');
   process.exitCode=2;
 }else{
   try{
     const pulse=JSON.parse(fs.readFileSync(input,'utf8'));
     const publicPulse=projectPublicKaidancePulse(pulse);
     // This writes only explicitly requested output. Serving that directory is a separate operator action.
     fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true,mode:0o750});
     const tmp=output+'.'+process.pid+'.tmp';
     fs.writeFileSync(tmp,JSON.stringify(publicPulse,null,2)+'\n',{mode:0o640,flag:'wx'});
     fs.renameSync(tmp,output);
     console.log(JSON.stringify({schema:'evercraft.kaidance.public-export-receipt.v1',status:'staged',approval_ref:approval,output:path.resolve(output),cycle_number:publicPulse.cycle_number}));
   }catch(error){console.error('public-export-held:',error.message);process.exitCode=1}
 }
}
