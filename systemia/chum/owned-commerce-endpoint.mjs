export function ownedHttpsEndpoint(value,{name='endpoint',required=true}={}){
  const raw=String(value||'').trim();
  if(!raw){
    if(required) throw new Error(name+'_required');
    return null;
  }
  let url;
  try{url=new URL(raw);}catch{throw new Error(name+'_invalid_url');}
  if(url.protocol!=='https:') throw new Error(name+'_https_required');
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(host==='base44.app'||host.endsWith('.base44.app')) throw new Error(name+'_legacy_provider_blocked');
  if(host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host==='::1'||host.endsWith('.local')){
    throw new Error(name+'_public_host_required');
  }
  return url.toString();
}
