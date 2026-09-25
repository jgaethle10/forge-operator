import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const OWNERS=new Set([
  'jessegaethle10@gmail.com','paola.verjan@gmail.com','daryl.wright0811@gmail.com',
  'mckaylastucker@gmail.com','by_romas@icloud.com','jochoa5111@gmail.com'
]);

function clean(v:any){return String(v??'').trim()}
function normAddress(v:any){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
async function sha256Hex(v:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST'){
      return Response.json({ok:false,allowed:false,error:'POST required'},{status:405,headers:{'Cache-Control':'no-store'}});
    }
    const base44=createClientFromRequest(req);
    const body=await req.json().catch(()=>({}));
    const purpose=clean(body?.purpose);
    if(purpose!=='energy_site_lookup'){
      return Response.json({ok:true,allowed:false,authority:'purpose_not_allowed'},{headers:{'Cache-Control':'no-store'}});
    }

    const grant=clean(body?.grant);
    const reportId=clean(body?.report_id);
    const addressNorm=normAddress(body?.address);
    if(grant||reportId){
      if(!grant||!reportId||!addressNorm){
        return Response.json({ok:true,allowed:false,authority:'invalid_or_expired_report_grant'},{headers:{'Cache-Control':'no-store'}});
      }
      const report:any=await base44.asServiceRole.entities.RIVETReport.get(reportId).catch(()=>null);
      let envelope:any=null;
      try{envelope=JSON.parse(clean(report?.aliev_report_data_json)||'null')}catch{}
      const actualHash=await sha256Hex(grant);
      const expiry=Date.parse(clean(envelope?.expires_at));
      const valid=Boolean(
        report?.id &&
        report?.generation_state==='generating' &&
        envelope?.kind==='RIVET_SOURCE_GRANT_V1' &&
        clean(envelope?.hash) &&
        clean(envelope?.hash)===actualHash &&
        clean(envelope?.purpose)===purpose &&
        Number.isFinite(expiry) &&
        expiry>Date.now() &&
        clean(envelope?.address_norm)===addressNorm
      );
      if(!valid){
        return Response.json({ok:true,allowed:false,authority:'invalid_or_expired_report_grant'},{headers:{'Cache-Control':'no-store'}});
      }
      const consumedAt=new Date().toISOString();
      await base44.asServiceRole.entities.RIVETReport.update(reportId,{
        aliev_report_data_json:'',
        aliev_retrieved_at:consumedAt,
        updated_at:consumedAt
      });
      return Response.json({
        ok:true,
        allowed:true,
        authority:'rivet_one_time_report_grant',
        subject_id:reportId
      },{headers:{'Cache-Control':'no-store'}});
    }

    const me:any=await base44.auth.me().catch(()=>null);
    const email=clean(me?.email).toLowerCase();
    if(!me?.id){
      return Response.json({ok:true,allowed:false,authority:'unauthenticated'},{headers:{'Cache-Control':'no-store'}});
    }

    const allowed=me?.role==='admin'||me?.rivet_owner===true||OWNERS.has(email);
    return Response.json({
      ok:true,
      allowed,
      authority:allowed?'rivet_internal_owner':'rivet_user_not_authorized',
      subject_id:allowed?String(me.id):undefined
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    console.error('verifyRivetInternalAccess failed',e);
    return Response.json({ok:false,allowed:false,error:'verification_failed'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
});