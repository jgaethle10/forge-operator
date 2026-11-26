// An explicit, opt-in authenticated Home transport for Systemia Atlas.
// No static route, grant bootstrap, automatic dispatch, external messaging or payment.
const PATH=/^\/api\/atlas\/private\/([a-z0-9][a-z0-9_-]{2,63})(\/events)?$/;
const PRODUCT='systemia-atlas';
export const ATLAS_HOME_BRIDGE_SCHEMA='evercraft.atlas.home-private-bridge.v1';

export function atlasHomeOriginAllowed(req,{cookieSecure=true}={}){
 const originHeader=req.headers.origin;
 if(typeof originHeader!=='string'||!originHeader||originHeader==='null')return false;
 if(typeof req.headers.host!=='string'||!req.headers.host)return false;
 const fetchSite=req.headers['sec-fetch-site'];
 if(fetchSite&&fetchSite!=='same-origin')return false;
 try{
  const origin=new URL(originHeader);
  if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return false;
  if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&!cookieSecure))return false;
  return origin.host===req.headers.host;
 }catch{return false}
}
function reply(res,status,data,respond){respond(res,status,{
 ok:status>=200&&status<300,
 schema:ATLAS_HOME_BRIDGE_SCHEMA,
 ...data,
 dispatch_authorized:false,
 external_action_performed:false
});return true}
function errorStatus(err){
 const message=String(err?.message||'');
 if(message==='atlas_access_denied'||message==='atlas_explicit_tenant_grant_required')return {status:403,state:'atlas_access_denied'};
 if(message.startsWith('session_'))return {status:401,state:'atlas_session_invalid'};
 if(message==='atlas_revision_conflict'||message==='atlas_idempotency_conflict')return {status:409,state:message};
 if(message==='atlas_mutation_lock_busy')return {status:423,state:'atlas_write_busy'};
 if(/^(atlas_hash_mismatch|atlas_chain_invalid|atlas_truncated_event_log|atlas_event_json_invalid|atlas_empty_event|atlas_private_)/.test(message))return {status:409,state:'atlas_evidence_integrity_hold'};
 if(/^(atlas_[a-z0-9_]+|request_body_[a-z0-9_]+)$/.test(message))return {status:400,state:'atlas_request_rejected'};
 return {status:503,state:'atlas_private_unavailable'};
}
export async function handleAtlasHomeRequest({
 req,res,url,ledger,homeSession,sessionToken,readBody,respond,cookieSecure=true
}={}){
 if(!url?.pathname?.startsWith('/api/atlas'))return false;
 // Deliberately not found if disabled; never fall through to the SPA for API paths.
 if(!ledger)return reply(res,404,{state:'atlas_not_enabled'},respond);
 const match=PATH.exec(url.pathname);
 if(!match||url.search)return reply(res,404,{state:'atlas_route_not_found'},respond);
 const tenant=match[1],write=Boolean(match[2]);
 if((write&&req.method!=='POST')||(!write&&req.method!=='GET'))
  return reply(res,405,{state:'atlas_method_not_allowed'},respond);
 // Home is a first authentication gate, Atlas grants are checked again by the ledger.
 const home=homeSession(req,'home.read');
 if(!home.ok)return reply(res,home.status||401,{state:'atlas_home_session_required'},respond);
 if(!sessionToken)return reply(res,401,{state:'atlas_session_required'},respond);
 if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'&&
    req.headers['sec-fetch-site']!=='none')
  return reply(res,403,{state:'atlas_cross_site_denied'},respond);
 if(write){
  if(!atlasHomeOriginAllowed(req,{cookieSecure}))
   return reply(res,403,{state:'atlas_mutation_origin_denied'},respond);
  if(req.headers['x-evercraft-atlas-intent']!=='mutation-v1')
   return reply(res,403,{state:'atlas_intent_header_required'},respond);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']||'')))
   return reply(res,415,{state:'atlas_content_type_required'},respond);
  if(Number(req.headers['content-length']||0)>8192)
   return reply(res,413,{state:'atlas_body_too_large'},respond);
  try{
   const body=await readBody(req,8192);
   if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(key=>!['type','payload','idempotency_key','expected_revision'].includes(key)))
    return reply(res,400,{state:'atlas_request_rejected'},respond);
   const result=ledger.mutate({
    sessionToken,tenant,type:body.type,payload:body.payload,
    idempotencyKey:body.idempotency_key,expectedRevision:body.expected_revision
   });
   return reply(res,result.state==='recorded'?201:200,{
    state:result.state,revision:result.revision,event_id:result.event_id,
    event_hash:result.event_hash,record:result.record||null
   },respond);
  }catch(error){
   const out=errorStatus(error);
   return reply(res,out.status,{state:out.state},respond);
  }
 }
 try{
  const result=ledger.read({sessionToken,tenant});
  return reply(res,200,{
   state:'private_snapshot',snapshot:result,
   data_classification:'private_operator_entered_unverified',
   authority:PRODUCT+'_authenticated_read_only'
  },respond);
 }catch(error){
  const out=errorStatus(error);
  return reply(res,out.status,{state:out.state},respond);
 }
}
