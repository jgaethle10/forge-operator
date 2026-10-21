// Pure router-control assessment. This is NOT public reachability verification.
function sameMapping(a,b) {
  return a?.external===b?.external &&
    a?.internal===b?.internal &&
    a?.proto===b?.proto;
}

export function assessRouterMappings(requested, results) {
  if(!Array.isArray(requested)||!Array.isArray(results)){
    throw new TypeError('expected requested and results arrays');
  }
  const selected=requested.filter(m=>m.diagnostic!==true);
  const diagnostics=requested.filter(m=>m.diagnostic===true);
  const web=selected.filter(m=>m.scope==='web');
  const dns=selected.filter(m=>m.scope==='dns');
  const matched=(m)=>results.some(r=>r?.success===true&&sameMapping(r.requested,m));
  const passed=(items)=>items.length>0&&items.every(matched);
  const missing=selected.filter(m=>!matched(m));
  return {
    production_mapping_control_ok:passed(selected),
    diagnostic_mapping_control_ok:passed(diagnostics),
    web_mapping_control_ok:passed(web),
    dns_mapping_control_ok:passed(dns),
    requested_production_count:selected.length,
    missing_production_mappings:missing.map(m=>({
      external:m.external,internal:m.internal,proto:m.proto,scope:m.scope
    }))
  };
}
