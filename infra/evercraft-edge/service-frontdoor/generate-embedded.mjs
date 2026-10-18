#!/usr/bin/env node
// Generate self-contained immutable static pages for the two-domain edge shell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const sources=[
  ['EPS_HTML','public/eps/index.html'],
  ['HAVENLY_HTML','public/havenly/index.html'],
  ['EPS_ESTIMATOR_HTML','public/apps/eps-estimator/index.html'],
];
export const embeddedSource=()=> '/* GENERATED; run node infra/evercraft-edge/service-frontdoor/generate-embedded.mjs */\n'+sources.map(([name,filename])=>
  'export const '+name+' = '+JSON.stringify(fs.readFileSync(path.join(root,filename),'utf8'))+';\n').join('');
const target=path.join(here,'embedded-sites.mjs');
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const expected=embeddedSource();
  if(process.argv.includes('--write')){
    fs.writeFileSync(target,expected);
    console.log('Generated embedded sites');
  }else{
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==expected){
      console.error('Embedded HTML is stale; run generator with --write');
      process.exitCode=1;
    }else console.log('Embedded HTML matches all canonical sources');
  }
}
