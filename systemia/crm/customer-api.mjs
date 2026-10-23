import {loadCustomerWorkspaceFromVault} from './customer-vault.mjs';

const ROUTE='/v1/relationship-command/workspace';
const COMMON={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, max-age=0',
 'x-content-type-options':'nosniff',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'referrer-policy':'no-referrer'
};
function answer(res,status,payload,additional={}){
 res.writeHead(status,{...COMMON,...additional});
 res.end(JSON.stringify(payload));
}
/**
 * Attachable API handler, NOT a listener or a login service.
 * The embedding server MUST supply authenticated private session authority
 * from its own identity provider. No tenant/role claims accepted via query.
 */
export function createRelationshipCommandApi({
 vaultDir='',authenticate=null,clock=()=>new Date()
}={}){
 if(typeof authenticate!=='function')throw Error('customer_api_trusted_authentication_required');
 if(typeof vaultDir!=='string'||!vaultDir.trim())throw Error('customer_api_vault_not_configured');
 if(typeof clock!=='function')throw Error('customer_api_clock_invalid');
 return async function handle(req,res){
   let route;
   try{
     const parsed=new URL(req.url||'', 'http://internal.invalid');
     route=parsed.pathname;
     if(parsed.search||parsed.hash) {
       answer(res,400,{error:'unrecognized_request'});return;
     }
   }catch{answer(res,400,{error:'unrecognized_request'});return;}
   if(route!==ROUTE){answer(res,404,{error:'not_found'});return;}
   if(req.method!=='GET'){
     answer(res,405,{error:'method_not_allowed'},{allow:'GET'});return;
   }
   let auth;
   try{auth=await authenticate(req);}catch{
     answer(res,401,{error:'not_authorized'});return;
   }
   if(auth?.verified!==true||!auth?.tenant_id||!auth?.access){
     answer(res,401,{error:'not_authorized'});return;
   }
   try{
     const result=loadCustomerWorkspaceFromVault({
       vaultDir,tenantId:auth.tenant_id,access:auth.access,now:clock()
     });
     answer(res,200,result);
   }catch{
     // Never emit private paths, contact names, source refs or auth internals.
     answer(res,403,{error:'workspace_unavailable_or_forbidden'});
   }
 };
}
