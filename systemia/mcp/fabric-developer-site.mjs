// Owned Fabric developer entry. Public discovery only: no Base44 proxy,
// specialist execution, checkout, customer account, or release attestation.
const ORIGIN='https://fabric.systemiacommandcenters.com';
const MCP=ORIGIN+'/mcp';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HOLD=[
  ['ForensiScope','Media routing and evidence review'],
  ['FindMyPart','Part identification and sourcing'],
  ['EventWave','Event discovery and promotion'],
  ['Evercraft Clip','Campaign planning and video workflows'],
  ['Evercraft Web','Public web retrieval'],
  ['Capability Discovery','Developer-to-capability matching']
];
export function ownedDeveloperStatus(capabilities=[],{deploymentReceiptBound=false}={}){
  return {
    schema:'evercraft.fabric.owned-developer-entry.v1',
    service:'Evercraft Fabric',
    payment_authority:'Evercraft Payments',
    settlement_router:'Raven Nexus',
    scope:'public_read_only_discovery',
    enabled_mcp:{
      name:'Evercraft Fabric',
      url:MCP,
      tool_names:['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options'],
      execution_scope:'public_capability_discovery_only',
      partner_installation_verified:false
    },
    reported_capabilities:capabilities.length,
    legacy_specialists:HOLD.map(([name,intended_use])=>({
      name,intended_use,
      state:'held_after_http_402_external_probe_2026-10-17',
      mcp_url:null,
      do_not_route_new_users:true,
      explanation:'Previously published specialist transport returned HTTP 402. No owned replacement has passed an independent release gate.'
    })),
    commerce:{
      platform:'Evercraft Payments',
      current_live_checkout_asserted:false,
      actual_provider_paid_receipt_asserted:false,
      platform_percent_fee_state:'design_only_not_active',
      create_checkout_available_here:false
    },
    exact_runtime_release:{
      deployment_receipt_bound:deploymentReceiptBound===true,
      fully_attested_by_this_endpoint:false,
      note:'An unsigned or self-reported deployment flag cannot substitute for independent Yard artifact/runtime verification.'
    },
    human_url:ORIGIN+'/developers',
    machine_url:ORIGIN+'/developers.json',
    read_only:true,
    purchases_created:false,
    external_action_taken:false
  };
}
export function renderOwnedDeveloperPage({capabilities=[],matches=[],intent='',deploymentReceiptBound=false}={}){
  const query=String(intent||'').trim().slice(0,200);
  const safeQuery=escapeHtml(query);
  const items=Array.isArray(matches)?matches.slice(0,6):[];
  const status=ownedDeveloperStatus(capabilities,{deploymentReceiptBound});
  const cards=status.legacy_specialists.map((x,i)=>
    '<article class="module"><div class="module-index">0'+(i+1)+' <span class="held">SPECIALIST HELD</span></div>'+
    '<h3>'+escapeHtml(x.name)+'</h3><p>'+escapeHtml(x.intended_use)+'</p>'+
    '<div class="module-foot">Owned endpoint: <strong>not yet verified</strong></div></article>').join('');
  const results=query?'<section class="matches" aria-live="polite"><div class="eyebrow">READ-ONLY CAPABILITY MATCHING</div><h2>Closest research matches</h2>'+
    (items.length?'<div class="match-grid">'+items.map(x=>
      '<article class="match"><strong>'+
      escapeHtml(x.name)+'</strong><span>'+escapeHtml(String(x.description||'').slice(0,200))+
      '</span><em>Public directory information · specialist execution held</em></article>').join('')+'</div>':
      '<p class="empty">No confident catalog match. We will not recommend an unrelated paid service.</p>')+
      '<p class="quiet">A match is a source-backed directory suggestion, not a functioning specialist integration, successful checkout or fulfilled task.</p></section>':'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="theme-color" content="#071220">'+
    '<meta name="description" content="Discover the Evercraft-owned public MCP and its current integration boundaries. Broken specialist and checkout routes remain clearly held.">'+
    '<title>Evercraft | Developer Integrations</title>'+
    '<style>'+
    ':root{color-scheme:dark;--bg:#071220;--surface:#102036;--line:#304b64;--text:#f4f9ff;--sub:#b6cad9;--mint:#88ead3}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(ellipse 80% 480px at 82% -10%,#244a6c,transparent 90%),var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}a{color:inherit}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid var(--mint);outline-offset:3px}.container{width:min(1130px,100%);margin:auto;padding:0 22px}.nav{padding:22px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.brand{text-decoration:none;letter-spacing:.12em;font-size:13px;font-weight:900}.brand b{display:inline-grid;place-items:center;width:33px;height:33px;background:var(--mint);color:#0a2531;border-radius:10px;font-size:20px;margin-right:10px}.nav a:not(.brand){color:var(--sub);font-size:13px}.hero{padding:77px 0 54px;display:grid;grid-template-columns:1.5fr .6fr;gap:40px;align-items:center}.eyebrow{color:var(--mint);letter-spacing:.15em;font-size:11px;font-weight:850;text-transform:uppercase}h1{font-size:clamp(39px,6vw,75px);letter-spacing:-.065em;line-height:1.03;margin:17px 0 20px}h1 span{color:var(--mint)}.lead{font-size:clamp(16px,2vw,21px);color:#cfdeed;max-width:700px}.panel{background:linear-gradient(145deg,#1d3c55,#0d2034);border:1px solid #4b6e88;border-radius:23px;padding:27px}.panel strong{display:block;font-size:clamp(24px,3vw,35px);line-height:1.12;letter-spacing:-.035em}.panel p{color:var(--sub);font-size:13px;margin-bottom:0}.label{display:inline-block;margin-bottom:20px;background:#214444;color:#b0f2df;padding:6px 10px;border-radius:40px;font-size:10px;letter-spacing:.1em;font-weight:800}.info{display:flex;flex-wrap:wrap;gap:10px;padding:0 0 32px}.info span{border:1px solid #3a6174;padding:7px 12px;border-radius:30px;font-size:12px;color:#c4dfe9}.connect{border:1px solid #45647b;background:var(--surface);border-radius:21px;padding:29px;margin:30px 0 60px}.connect h2,.matches h2,.section-title h2{font-size:clamp(27px,3.8vw,40px);letter-spacing:-.04em;line-height:1.1;margin:8px 0 16px}.connect p,.section-title p{color:var(--sub);max-width:750px}.endpoint{background:#08182b;border:1px solid #3e5a78;border-radius:13px;color:#c2ecff;padding:17px;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,monospace}.tools{display:flex;flex-wrap:wrap;gap:7px;margin:18px 0}.tools code{font-size:11px;border:1px solid #3b5470;background:#213751;border-radius:7px;padding:6px 8px;overflow-wrap:anywhere}.notice{font-size:13px;color:#d2dccf;border-left:3px solid var(--mint);padding-left:14px}.search{background:#142b43;border:1px solid #3d627d;border-radius:20px;padding:25px;margin:0 0 65px}.search label{display:block;font-size:20px;font-weight:800;margin-bottom:12px}.field{display:flex;gap:11px}.field input{flex:1;min-width:0;background:#061528;border:1px solid #5e8199;border-radius:12px;color:#fff;font:inherit;padding:13px 16px}.field button{background:var(--mint);color:#102832;border:0;border-radius:12px;padding:13px 19px;font:inherit;font-weight:850;cursor:pointer}.quiet{font-size:13px;color:var(--sub)}.matches{margin-bottom:55px}.match-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.match{display:flex;flex-direction:column;text-decoration:none;border:1px solid #3a6076;border-radius:15px;padding:19px;background:#142940;gap:7px}.match strong{font-size:17px}.match span{color:var(--sub);font-size:13px}.match em{font-size:12px;color:var(--mint);font-style:normal}.empty{border:1px solid var(--line);padding:19px;border-radius:13px}.section-title{margin-bottom:22px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.module{background:#102035;border:1px solid var(--line);border-radius:17px;padding:21px;min-width:0;display:flex;flex-direction:column}.module-index{display:flex;justify-content:space-between;align-items:center;gap:8px;color:#acc5d5;font-size:12px}.held{color:#ffd9a5;background:#453525;border:1px solid #7b6041;padding:5px 8px;border-radius:30px;font-size:10px;font-weight:800}.module h3{font-size:22px;line-height:1.18;letter-spacing:-.03em;margin:30px 0 10px}.module p{font-size:14px;color:var(--sub);margin:0 0 28px}.module-foot{margin-top:auto;border-top:1px solid var(--line);padding-top:13px;color:#bccfdd;font-size:12px}.footer{margin-top:72px;border-top:1px solid var(--line);padding:26px 0 48px;font-size:12px;color:#afc4d4;display:flex;justify-content:space-between;flex-wrap:wrap;gap:15px}.footer a{color:var(--mint)}@media(max-width:920px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{gap:18px}}@media(max-width:680px){.container{padding:0 17px}.hero{display:block;padding:52px 0 25px}.panel{margin-top:25px;padding:20px}.connect,.search{padding:20px}.field{display:block}.field input,.field button{width:100%}.field button{margin-top:9px}.grid,.match-grid{grid-template-columns:1fr}.module h3{margin-top:22px}.footer{margin-top:50px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'+
    '</style></head><body><div class="container"><header class="nav"><a class="brand" href="/"><b>E</b>EVERCRAFT / DEVELOPERS</a><a href="/capabilities">Browse all capabilities ↗</a></header><main>'+
    '<section class="hero"><div><div class="eyebrow">Sovereign Fabric / Developer access</div>'+
    '<h1>Build your thing.<br><span>Borrow what is proven.</span></h1>'+
    '<p class="lead">Our public capability directory is moving onto Evercraft-controlled infrastructure. One read-only integration door is available in the source runtime. Specialist endpoints are held until they can pass independent tests again.</p>'+
    '</div><aside class="panel"><span class="label">DISCOVERY ONLY</span><strong>Public tools.<br>Honest boundaries.</strong><p>No customer-data access, paid execution, automatic checkout or merchant account permissions from this page.</p></aside></section>'+
    '<div class="info"><span>'+String(status.reported_capabilities)+' published capability records</span><span>Read-only MCP</span><span>Specialist execution held</span><span>Evercraft Payments is canonical</span></div>'+
    '<section class="connect"><div class="eyebrow">One Evercraft-owned connection</div><h2>Start with the Fabric MCP</h2>'+
    '<p>Use this remote Streamable HTTP URL in a compatible MCP client. It can list public capabilities, match a problem, and return current connection options. It does not execute specialist operations or take money.</p>'+
    '<div class="endpoint">'+MCP+'</div><div class="tools">'+status.enabled_mcp.tool_names.map(x=>'<code>'+escapeHtml(x)+'</code>').join('')+'</div>'+
    '<p class="notice">A source-level route is not a signed deployment receipt. Check <a href="/health">the current runtime health</a> before relying on this service. Partner installation remains unverified.</p></section>'+
    '<section class="search"><form method="get" action="/developers" role="search"><label for="intent">What are you building?</label><div class="field"><input id="intent" name="intent" value="'+safeQuery+'" maxlength="200" placeholder="A research agent that needs source-backed public data…" required><button type="submit">Explore relevant capabilities ↗</button></div><p class="quiet">Browse public descriptions, not an automated purchase recommendation. No signup or charge.</p></form></section>'+results+
    '<section><div class="section-title"><div class="eyebrow">Specialist integration status</div><h2>What still needs engineering.</h2>'+
    '<p>These are genuine Evercraft product areas, but their previous provider-hosted MCP URLs returned HTTP 402 during independent verification on October 17. We will not route your application into dead links.</p></div>'+
    '<div class="grid">'+cards+'</div></section></main><footer class="footer"><span>© 2026 Evercraft LLC · Discovery is not execution.</span><span><a href="/developers.json">Machine-readable status</a> · <a href="/health">Health</a></span></footer></div></body></html>';
}
