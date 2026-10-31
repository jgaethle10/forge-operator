#!/usr/bin/env node
// Read-only audit for historical public discovery surfaces, not a deletion or publishing workflow.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export const SOURCE_PATHS=[
 'public/.well-known/evercraft-products.json',
 'registry/public-products.json',
 'registry/catalog.json',
 'conformance/products.json',
 'public/chum/index.json',
 'public/feed.json',
 'public/chum/pain-index.json',
 'public/.well-known/evercraft-pain-index.json',
 'public/chum/syndication/index.json'
];
export const HELD_KEYS=['skyops-parking','rivet','aliev'];
const PATTERNS={
 'skyops-parking':/\bskyops[\s_-]?parking\b|\bskyops-parking\b/ig,
 'rivet':/\brivet\b/ig,
 'aliev':/\baliev\b|\bali[\s_-]?ev\b/ig
};
export function auditCatalog(sourceRows){
  const findings=[];
  for(const row of sourceRows){
    const s=String(row.content??'');
    const matches=HELD_KEYS.flatMap(key=>{
      const count=[...s.matchAll(new RegExp(PATTERNS[key].source,'ig'))].length;
      return count>0?[{key,occurrences:count}]:[];
    });
    if(matches.length)findings.push({source:row.path,restricted_references:matches});
  }
  return {schema:'evercraft.brand.public-discovery-exposure-audit.v1',read_only:true,
    inspected:sourceRows.length,surfaces_with_restricted_references:findings.length,findings};
}
export function readCatalog(root=ROOT){
  return SOURCE_PATHS.filter(p=>fs.existsSync(path.join(root,p))).map(p=>({path:p,content:fs.readFileSync(path.join(root,p),'utf8')}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditCatalog(readCatalog());
  console.log(JSON.stringify(report,null,2));
  // --strict is for a future explicit cleanup QA gate; current baseline is not yet sanitized.
  if(process.argv.includes('--strict')&&report.surfaces_with_restricted_references>0)process.exitCode=1;
}
