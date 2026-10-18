import { EPS_HTML, HAVENLY_HTML, EPS_ESTIMATOR_HTML } from './embedded-sites.mjs';

// Hostname-based public front door. This worker NEVER fetches the retired Base44
// upstream; the website bytes are bundled at build time from canonical sources.
const DOMAINS = Object.freeze({
  'evercraftpropertyservices.com':'eps',
  'havenlycleaning.com':'havenly',
});
const PROTECTED_PATHS = /^(?:\/api(?:\/|$)|\/admin(?:\/|$)|\/\.well-known(?:\/|$)|\/private(?:\/|$)|\/favicon\.ico$)/i;
const security = {
  'cache-control':'public, max-age=60, must-revalidate',
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'x-frame-options':'DENY',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  // The canonical customer pages have inline styling and simple on-device
  // quote composer/calculator JS. No third-party scripts, API calls or forms.
  'content-security-policy':"default-src 'none'; base-uri 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'",
  'x-evercraft-frontdoor':'embedded-static-no-legacy-upstream',
};
const plain = (body, status, method, headers={})=>new Response(method==='HEAD'?null:body,{status,headers:{...security,'content-type':'text/plain; charset=utf-8',...headers}});
const page = (body, service, method)=>new Response(method==='HEAD'?null:body,{status:200,headers:{...security,'content-type':'text/html; charset=utf-8','x-evercraft-service':service}});
const previewHosts = env=>String(env?.PREVIEW_HOSTS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);

function matchService(url,env){
  const hostname=url.hostname.toLowerCase().replace(/\.$/,'');
  if(Object.hasOwn(DOMAINS,hostname))return{service:DOMAINS[hostname],host:hostname,preview:false};
  if(hostname.startsWith('www.')&&Object.hasOwn(DOMAINS,hostname.slice(4)))return{service:DOMAINS[hostname.slice(4)],host:hostname.slice(4),preview:false,www:true};
  if(previewHosts(env).includes(hostname)||hostname==='localhost'||hostname==='127.0.0.1'){
    const hit=url.pathname.match(/^\/(eps|havenly)(?:\/|$)/);
    if(hit)return{service:hit[1],host:hostname,preview:true};
  }
  return null;
}
export async function handleRequest(request,{env={}}={}){
  const url=new URL(request.url);
  const m=matchService(url,env);
  if(!m)return plain('Misdirected request',421,request.method);
  if(request.method!=='GET'&&request.method!=='HEAD')return plain('Method not allowed',405,request.method,{'allow':'GET, HEAD'});
  if(m.www){
    const target=new URL(request.url);
    target.hostname=m.host;
    return Response.redirect(target.href,308);
  }

  let path=url.pathname;
  if(m.preview)path=path.slice(m.service.length+1)||'/';
  if(path==='/_evercraft/health'){
    const body=JSON.stringify({
      schema:'evercraft.service-frontdoor.health.v1',
      service:m.service,
      state:'static_content_ready',
      base44_upstream:false,
      source:'embedded_repo_snapshot',
      dns_cutover_verified:false,
      production_backend_verified:false,
    });
    return new Response(request.method==='HEAD'?null:body,{status:200,headers:{...security,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
  if(path==='/robots.txt')return plain('User-agent: *\nAllow: /\n',200,request.method,{'cache-control':'public, max-age=3600'});

  if(PROTECTED_PATHS.test(path))return plain('Not found',404,request.method,{'cache-control':'no-store'});
  if(m.service==='eps'&&(path==='/apps/eps-estimator/'||path==='/apps/eps-estimator'||path==='/estimator'||path==='/estimator/')){
    return page(EPS_ESTIMATOR_HTML,'eps-estimator',request.method);
  }
  if(path==='/'||path==='/index.html')return page(m.service==='eps'?EPS_HTML:HAVENLY_HTML,m.service,request.method);
  // Legacy bookmarks must not be forwarded to the HTTP 402 backend.
  // Customer can reach current intake, services and contact at the root.
  let landing=m.preview?'/'+m.service+'/':'/';
  if(path==='/quote'||path==='/contact')landing+='#quote';
  return new Response(null,{status:302,headers:{...security,'location':landing,'cache-control':'no-store'}});
}
export default {
  fetch(request,env){return handleRequest(request,{env});}
};
