import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createPrivateCustomerAuthenticator} from './customer-sessions.mjs';
import {createRelationshipCommandApi} from './customer-api.mjs';

const ASSETS=new Map([
 ['/relationship-command/',{file:'./customer-portal/index.html',type:'text/html; charset=utf-8'}],
 ['/relationship-command/portal.css',{file:'./customer-portal/portal.css',type:'text/css; charset=utf-8'}],
 ['/relationship-command/portal.js',{file:'./customer-portal/portal.js',type:'text/javascript; charset=utf-8'}]
]);
const PRIVACY={
 'cache-control':'private, no-store, max-age=0',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};
function reply(res,status,body,contentType){
 res.writeHead(status,{...PRIVACY,'content-type':contentType||'application/json; charset=utf-8'});
 res.end(body);
}
/**
 * Private same-origin route handler. The hosting edge must provide HTTPS,
 * separate session issuance and a trusted private vault. No listener started.
 */
export function createRelationshipCommandPrivateRuntime({
 vaultDir='',sessionDir='',clock=()=>new Date()
}={}){
 const authenticate=createPrivateCustomerAuthenticator({storeDir:sessionDir,clock});
 const api=createRelationshipCommandApi({vaultDir,authenticate,clock});
 const loaded=new Map([...ASSETS].map(([route,asset])=>[
  route,{...asset,body:fs.readFileSync(fileURLToPath(new URL(asset.file,import.meta.url)))}
 ]));
 return async function serve(req,res){
  let path;
  try{
   const uri=new URL(req?.url||'', 'http://private.invalid');
   if(uri.search||uri.hash)throw Error('query_not_allowed');
   path=uri.pathname;
  }catch{reply(res,400,JSON.stringify({error:'unrecognized_request'}));return;}
  if(path==='/v1/relationship-command/workspace')return api(req,res);
  const asset=loaded.get(path==='/relationship-command'?'/relationship-command/':path);
  if(!asset){reply(res,404,JSON.stringify({error:'not_found'}));return;}
  if(req.method!=='GET'){reply(res,405,JSON.stringify({error:'method_not_allowed'}));return;}
  const result=await authenticate(req);
  if(result?.verified!==true){
   reply(res,401,JSON.stringify({error:'not_authorized'}));return;
  }
  reply(res,200,asset.body,asset.type);
 };
}
