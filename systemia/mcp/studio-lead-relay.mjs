// Commercial Studio -> Systemia Relay: private durable operational alert outbox.
// Public buyer text never becomes instructions to agents or a public push payload.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNotificationClient} from '../notification-fabric/client.mjs';

const REF=/^EC-STUDIO-[A-F0-9]{20}$/;
const PROJECTS=new Set([
  '$50 launch-week 30-second social commercial pilot',
  'Product launch commercial','Brand story / ad campaign','Social video creative','Something else'
]);
const baseDir=()=>process.env.EVERCRAFT_STUDIO_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','studio-leads');
function privateDir(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.lstatSync(dir).isSymbolicLink())throw Error('studio_notification_symlink');
}
export function enqueueStudioAlert({folder=baseDir(),reference,project,received_at}){
  if(!REF.test(String(reference||''))||!PROJECTS.has(project)||!Number.isFinite(Date.parse(received_at)))throw Error('invalid_studio_notification_source');
  const alerts=path.join(folder,'alert-outbox');
  privateDir(folder);privateDir(alerts);
  const queued=path.join(alerts,reference+'.json');
  const payload={schema:'evercraft.studio.operator-alert.v1',reference,project,received_at,
    status:'PENDING_RELAY_DISPATCH',pii_stored:false};
  // One private entry per accepted lead, no raw name/email/brief text/IP.
  try{fs.writeFileSync(queued,JSON.stringify(payload)+'\n',{flag:'wx',mode:0o600});}
  catch(e){if(e.code!=='EEXIST')throw e;}
  return {queued:true,reference};
}
export function alertIntent(entry,recipient){
  if(entry?.schema!=='evercraft.studio.operator-alert.v1'||!REF.test(entry.reference)||!PROJECTS.has(entry.project))throw Error('invalid_studio_notification_record');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(String(recipient||'')))throw Error('studio_owner_principal_invalid');
  return {
    schema:'systemia.notification.intent.v2',
    product:'commercial-studio',
    purpose:'operational',
    priority:'high',
    title:'New commercial production inquiry',
    body:`A commercial brief for ${entry.project} was received. Reference: ${entry.reference}. Review it in the private Studio intake ledger before replying or quoting.`,
    recipient_ids:[recipient],
    evidence_state:'recorded_in_private_studio_intake',
    dedupe_key:'studio:'+entry.reference,
    dedupe_window_seconds:7*86400,
    data:{inquiry_reference:entry.reference,source:'studio_lead_form',contains_customer_pii:false},
  };
}
export async function deliverStudioAlerts({folder=baseDir(),recipient,notify,limit=15}){
  if(typeof notify!=='function'||!recipient)throw Error('studio_relay_not_configured');
  const outbox=path.join(folder,'alert-outbox'),receipts=path.join(folder,'alert-receipts');
  if(!fs.existsSync(outbox))return {queued:0,accepted:0,failed:0};
  privateDir(receipts);
  const files=fs.readdirSync(outbox).filter(f=>/^EC-STUDIO-[A-F0-9]{20}\.json$/.test(f)).sort().slice(0,limit);
  let accepted=0,failed=0;
  for(const file of files){
    const filePath=path.join(outbox,file);
    try{
      if(!fs.lstatSync(filePath).isFile()||fs.lstatSync(filePath).isSymbolicLink())throw Error('unsafe_alert');
      const row=JSON.parse(fs.readFileSync(filePath,'utf8'));
      if(row.reference+'.json'!==file)throw Error('reference_mismatch');
      const reply=await notify(alertIntent(row,recipient));
      // Relay acceptance means a durable inbox entry, NOT a device push or human acknowledgement.
      const inboxed=Number(reply?.inboxed??reply?.result?.inboxed??0);
      if(!Number.isFinite(inboxed)||inboxed<1)throw Error('no_relay_inbox_acceptance');
      const receipt={schema:'evercraft.studio.relay-acceptance.v1',reference:row.reference,
        accepted_at:new Date().toISOString(),relay_inboxed:inboxed,human_seen:false};
      fs.writeFileSync(path.join(receipts,file),JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
      fs.unlinkSync(filePath);
      accepted++;
    }catch{failed++;}
  }
  return {queued:files.length,accepted,failed};
}
export function createStudioAlertDispatcher({folder=baseDir(),recipient=process.env.EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL,
  baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL,token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN,
  notify,intervalMs=60000}={}){
  const enabled=Boolean(recipient&&(notify||baseUrl&&token));
  if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
  const sender=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
  let ongoing=false;
  const dispatch=async()=>{
    if(ongoing)return {state:'BUSY'};
    ongoing=true;
    try{return await deliverStudioAlerts({folder,recipient,notify:sender});}
    finally{ongoing=false;}
  };
  let timer=null;
  return {enabled:true,dispatch,
    start(){if(timer)return;timer=setInterval(()=>{void dispatch().catch(()=>{});},Math.max(5000,intervalMs));timer.unref?.();},
    stop(){if(timer){clearInterval(timer);timer=null;}}
  };
}
