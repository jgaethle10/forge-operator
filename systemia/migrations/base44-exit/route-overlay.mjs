import fs from 'node:fs';
import path from 'node:path';

export const ROUTE_OVERLAY_SCHEMA='evercraft.base44.active-route-overlay.v1';

function clean(value){ return String(value??'').trim(); }
function safeKey(value,field){
  const text=clean(value).toLowerCase();
  if(!text||!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(text)) throw new Error(field+'_invalid');
  return text;
}
function httpsUrl(value){
  const url=new URL(clean(value));
  if(url.protocol!=='https:') throw new Error('public_route_overlay_https_required');
  if(url.username||url.password) throw new Error('public_route_overlay_credentials_forbidden');
  return url.toString();
}
function receipt(value,field){
  const text=clean(value);
  if(!text) throw new Error(field+'_required');
  return text;
}

export function buildActiveRouteOverlay(records=[],{observedAt=new Date().toISOString()}={}){
  if(!Array.isArray(records)) throw new Error('route_overlay_records_array_required');
  const routes=[];
  const seen=new Set();

  for(const row of records){
    if(row?.state!=='active') continue;
    const productKey=safeKey(row.product_key,'product_key');
    const surface=safeKey(row.surface,'surface');
    const key=productKey+':'+surface;
    if(seen.has(key)) throw new Error('route_overlay_duplicate_active_route');
    seen.add(key);

    routes.push({
      product_key:productKey,
      surface,
      destination_url:httpsUrl(row.destination_url),
      release_ref:receipt(row.release_ref,'release_ref'),
      deployment_receipt_ref:receipt(row.deployment_receipt_ref,'deployment_receipt_ref'),
      route_binding_receipt_ref:receipt(row.route_binding_receipt_ref,'route_binding_receipt_ref'),
      route_probe_receipt_ref:receipt(row.route_probe_receipt_ref,'route_probe_receipt_ref'),
      cutover_receipt_ref:receipt(row.cutover_receipt_ref,'cutover_receipt_ref'),
      authority:'active_cutover'
    });
  }

  routes.sort((a,b)=>(a.product_key+':'+a.surface).localeCompare(b.product_key+':'+b.surface));
  return {
    schema:ROUTE_OVERLAY_SCHEMA,
    observed_at:new Date(observedAt).toISOString(),
    active_route_count:routes.length,
    routes,
    legacy_route_values_emitted:false,
    verified_candidates_emitted:false,
    staged_candidates_emitted:false
  };
}

export function validateActiveRouteOverlay(overlay){
  if(overlay?.schema!==ROUTE_OVERLAY_SCHEMA) throw new Error('route_overlay_schema_invalid');
  if(!Array.isArray(overlay.routes)) throw new Error('route_overlay_routes_array_required');
  const rebuilt=buildActiveRouteOverlay(
    overlay.routes.map((row)=>({...row,state:'active'})),
    {observedAt:overlay.observed_at||new Date().toISOString()}
  );
  if(rebuilt.routes.length!==overlay.routes.length) throw new Error('route_overlay_count_invalid');
  return overlay;
}

export function resolveActiveRoute(overlay,productKey,surface,{fallbackUrl=null}={}){
  const product=safeKey(productKey,'product_key');
  const routeSurface=safeKey(surface,'surface');
  if(overlay){
    validateActiveRouteOverlay(overlay);
    const found=overlay.routes.find((row)=>row.product_key===product&&row.surface===routeSurface);
    if(found) return {
      url:found.destination_url,
      authority:'active_cutover',
      release_ref:found.release_ref,
      route_binding_receipt_ref:found.route_binding_receipt_ref,
      route_probe_receipt_ref:found.route_probe_receipt_ref,
      cutover_receipt_ref:found.cutover_receipt_ref
    };
  }
  const fallback=clean(fallbackUrl);
  return fallback?{url:fallback,authority:'legacy_fallback'}:null;
}

export function loadActiveRouteOverlay(filePath=''){
  const file=clean(filePath);
  if(!file) return null;
  const resolved=path.resolve(file);
  if(!fs.existsSync(resolved)) throw new Error('route_overlay_file_missing');
  return validateActiveRouteOverlay(JSON.parse(fs.readFileSync(resolved,'utf8')));
}

export function loadActiveRouteOverlayFromEnv(env=process.env){
  return loadActiveRouteOverlay(env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY||'');
}
