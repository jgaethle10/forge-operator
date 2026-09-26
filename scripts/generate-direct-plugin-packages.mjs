import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const specs=JSON.parse(fs.readFileSync(path.join(root,'distribution/direct-plugin-specs.json'),'utf8'));
const checkOnly=process.argv.includes('--check');
const LIVE_DIRECT_STATES=new Set([
  'registry_published_direct_mcp_existing',
  'public_https_verified_registry_pending',
]);
function isDirectLive(p){
  return LIVE_DIRECT_STATES.has(p.state) &&
    typeof p.mcp_url==='string' &&
    p.mcp_url.startsWith('https://');
}
function isRegistryPublished(p){
  return p.state==='registry_published_direct_mcp_existing' &&
    typeof p.registry_name==='string' &&
    p.registry_name.startsWith('io.github.jgaethle10/');
}

function stable(obj){ return JSON.stringify(obj,null,2)+'\n'; }
function ensureDir(file){ fs.mkdirSync(path.dirname(file),{recursive:true}); }
function write(file,content){
  const abs=path.join(root,file);
  ensureDir(abs);
  fs.writeFileSync(abs,content);
}

function packageFiles(p){
  const live=isDirectLive(p);
  const plugin={
    name:p.slug,
    version:'0.1.0',
    description:p.short_description,
    author:{name:'Evercraft LLC'},
    homepage:p.website_url,
    repository:'https://github.com/jgaethle10/forge-operator',
    license:'UNLICENSED',
    keywords:p.keywords,
    skills:'./skills/',
    mcpServers:'./mcp.json'
  };
  if(live && !isRegistryPublished(p)) plugin.registryState='PENDING';
  if(!live){
    plugin.releaseState=p.state.toUpperCase();
    if(p.runtime_path) plugin.pendingRuntimePath=p.runtime_path;
    if(p.public_origin_state) plugin.publicOriginState=p.public_origin_state;
  }

  const mcp=live
    ? {mcpServers:{[p.slug.replace(/-/g,'_')]:{type:'http',url:p.mcp_url}}}
    : {mcpServers:{}};

  const codex={
    name:p.slug,
    version:'0.1.0',
    description:p.long_description,
    author:{name:'Evercraft LLC',url:'https://github.com/jgaethle10/forge-operator'},
    homepage:p.website_url,
    repository:'https://github.com/jgaethle10/forge-operator',
    license:'UNLICENSED',
    keywords:p.keywords,
    skills:'./skills/',
    mcpServers:'./.mcp.json',
    interface:{
      displayName:p.name,
      shortDescription:p.short_description,
      longDescription:p.long_description,
      developerName:'Evercraft LLC',
      category:p.category,
      capabilities:['Interactive'],
      websiteURL:p.website_url,
      defaultPrompt:[p.default_prompt]
    }
  };
  if(live && !isRegistryPublished(p)) codex.registryState='PENDING';
  if(!live){
    codex.releaseState=p.state.toUpperCase();
    if(p.runtime_path) codex.pendingRuntimePath=p.runtime_path;
    if(p.public_origin_state) codex.publicOriginState=p.public_origin_state;
  }

  const skillName=p.slug+'-direct';
  const skill=`---
name: ${skillName}
description: ${p.short_description}
---

# ${p.name} Direct

Use this skill when the user's intent clearly matches this specialist: ${p.intent}

${live ? 'When this specialist is already available, do not force an obvious request through Evercraft Machine Commerce or CHUM first. Use the dedicated MCP directly.' : 'This specialist package is staged only. Do not route users to it directly until a verified public MCP origin exists. Keep using the universal Evercraft fallback meanwhile.'}

${p.truth_boundary}
`;

  return {
    [`plugins/${p.slug}/plugin.json`]:stable(plugin),
    [`plugins/${p.slug}/mcp.json`]:stable(mcp),
    [`plugins/${p.slug}/.mcp.json`]:stable(mcp),
    [`plugins/${p.slug}/.codex-plugin/plugin.json`]:stable(codex),
    [`plugins/${p.slug}/skills/${skillName}/SKILL.md`]:skill
  };
}

function buildDoorIndex(){
  return {
    schema:'evercraft.direct-product-doors.v1',
    generated_from:'distribution/direct-plugin-specs.json',
    routing_policy:specs.routing_policy,
    doors:specs.products.map(p=>({
      product:p.name,
      intent:p.intent,
      registry_name:isRegistryPublished(p) ? p.registry_name : null,
      registry_state:isRegistryPublished(p) ? 'published' : (isDirectLive(p) ? 'pending' : 'not_published'),
      remote_mcp:isDirectLive(p) ? p.mcp_url : null,
      runtime_path:p.runtime_path||null,
      runtime_workload_class:p.runtime_workload_class||null,
      public_origin_state:p.public_origin_state||null,
      plugin_package:`plugins/${p.slug}`,
      state:p.state,
      truth_boundary:p.truth_boundary
    }))
  };
}

const problems=[];
for(const p of specs.products){
  const files=packageFiles(p);
  if(checkOnly){
    for(const [file] of Object.entries(files)){
      const abs=path.join(root,file);
      if(!fs.existsSync(abs)){ problems.push('missing '+file); continue; }
    }
    const pluginPath=path.join(root,`plugins/${p.slug}/plugin.json`);
    const mcpPath=path.join(root,`plugins/${p.slug}/mcp.json`);
    if(fs.existsSync(pluginPath)){
      const plugin=JSON.parse(fs.readFileSync(pluginPath,'utf8'));
      if(plugin.name!==p.slug) problems.push(p.slug+': plugin name drift');
    }
    if(fs.existsSync(mcpPath)){
      const mcp=JSON.parse(fs.readFileSync(mcpPath,'utf8'));
      const servers=Object.values(mcp.mcpServers||{});
      const live=isDirectLive(p);
      if(live){
        const server=servers[0];
        if(!server||server.url!==p.mcp_url) problems.push(p.slug+': MCP URL drift');
      }else if(servers.length){
        problems.push(p.slug+': held package must not expose an MCP server');
      }
    }
  } else {
    for(const [file,content] of Object.entries(files)) write(file,content);
  }
}

const index=stable(buildDoorIndex());
for(const file of ['distribution/direct-product-doors.json','public/.well-known/evercraft-direct-doors.json']){
  const abs=path.join(root,file);
  if(checkOnly){
    if(!fs.existsSync(abs)) problems.push('missing '+file);
    else {
      const current=JSON.parse(fs.readFileSync(abs,'utf8'));
      if(current.schema!=='evercraft.direct-product-doors.v1') problems.push(file+': schema drift');
      if(current.routing_policy?.default!==specs.routing_policy.default) problems.push(file+': default routing drift');
      if(current.routing_policy?.fallback!==specs.routing_policy.fallback) problems.push(file+': fallback routing drift');
      const currentMap=new Map((current.doors||[]).map(d=>[d.product,d]));
      for(const p of specs.products){
        const d=currentMap.get(p.name);
        if(!d) problems.push(file+': missing door '+p.name);
        else {
          const expectedMcp=isDirectLive(p)?p.mcp_url:null;
          const expectedRegistry=isRegistryPublished(p)?p.registry_name:null;
          const expectedRegistryState=isRegistryPublished(p)?'published':(isDirectLive(p)?'pending':'not_published');
          if((d.registry_name||null)!==(expectedRegistry||null)) problems.push(file+': registry drift '+p.name);
          if((d.registry_state||null)!==expectedRegistryState) problems.push(file+': registry state drift '+p.name);
          if(d.remote_mcp!==expectedMcp) problems.push(file+': MCP drift '+p.name);
          if((d.runtime_path||null)!==(p.runtime_path||null)) problems.push(file+': runtime path drift '+p.name);
          if((d.public_origin_state||null)!==(p.public_origin_state||null)) problems.push(file+': public origin state drift '+p.name);
          if(d.state!==p.state) problems.push(file+': state drift '+p.name);
        }
      }
    }
  } else write(file,index);
}

if(checkOnly){
  if(problems.length){
    console.error('DIRECT_PLUGIN_FACTORY_FAIL');
    for(const p of problems) console.error('-',p);
    process.exit(1);
  }
  console.log('DIRECT_PLUGIN_FACTORY_PASS',JSON.stringify({
    products:specs.products.length,
    direct_live:specs.products.filter(isDirectLive).length,
    registry_backed:specs.products.filter(isRegistryPublished).length,
    registry_pending:specs.products.filter(p=>isDirectLive(p)&&!isRegistryPublished(p)).map(p=>p.slug),
    held:specs.products.filter(p=>!isDirectLive(p)).map(p=>p.slug)
  }));
} else {
  console.log('DIRECT_PLUGIN_FACTORY_GENERATED',JSON.stringify({
    products:specs.products.length,
    direct_live:specs.products.filter(isDirectLive).length,
    registry_backed:specs.products.filter(isRegistryPublished).length
  }));
}
