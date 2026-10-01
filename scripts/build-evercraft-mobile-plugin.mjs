#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv=process.argv.slice(2);
const readArg=(name)=>{
  const i=argv.indexOf(name);
  return i>=0 ? argv[i+1] : null;
};

const appId=readArg('--app-id')||process.env.EVERCRAFT_CHATGPT_APP_ID||'';
const outDir=path.resolve(readArg('--out')||'artifacts/evercraft-mobile-plugin');
const version=readArg('--version')||'0.1.0';

if(!/^plugin_asdk_app_[A-Za-z0-9_-]+$/.test(appId)){
  console.error('ERROR: --app-id must be a registered ChatGPT MCP app ID beginning with plugin_asdk_app_');
  process.exit(2);
}

const src=path.resolve('plugins/evercraft-mobile-template');
if(!fs.existsSync(src)) throw new Error('mobile template missing');

fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});

function copyTree(from,to){
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    if(entry.name==='.app.json.example') continue;
    const a=path.join(from,entry.name);
    const b=path.join(to,entry.name);
    if(entry.isDirectory()){
      fs.mkdirSync(b,{recursive:true});
      copyTree(a,b);
    }else{
      fs.copyFileSync(a,b);
    }
  }
}
copyTree(src,outDir);

const appManifest={
  apps:{
    evercraft:{
      id:appId,
      required:true,
    },
  },
};
fs.writeFileSync(path.join(outDir,'.app.json'),JSON.stringify(appManifest,null,2)+'\n');

for(const rel of ['plugin.json','.codex-plugin/plugin.json']){
  const file=path.join(outDir,rel);
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  json.version=version;
  fs.writeFileSync(file,JSON.stringify(json,null,2)+'\n');
}

for(const forbidden of ['mcp.json','.mcp.json']){
  if(fs.existsSync(path.join(outDir,forbidden))){
    throw new Error('desktop-only MCP declaration leaked into mobile package: '+forbidden);
  }
}

const root=JSON.parse(fs.readFileSync(path.join(outDir,'plugin.json'),'utf8'));
const codex=JSON.parse(fs.readFileSync(path.join(outDir,'.codex-plugin/plugin.json'),'utf8'));
if(root.extensions?.['com.openai']?.apps!=='./.app.json'){
  throw new Error('root manifest does not reference .app.json');
}
if(codex.apps!=='./.app.json'){
  throw new Error('Codex compatibility manifest does not reference .app.json');
}

const receipt={
  schema:'evercraft.mobile-plugin-build.v1',
  app_id:appId,
  version,
  output_dir:outDir,
  direct_mcp_manifests_present:false,
  app_manifest_present:true,
  built_at:new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir,'MOBILE-BUILD-RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
