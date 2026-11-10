#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const sources = [
 {source:'public/eps/index.html',target:'eps/index.html',marker:'eps-continuity-20261017'},
 {source:'public/havenly/index.html',target:'havenly/index.html',marker:'havenly-continuity-20261017'},
 {source:'public/sunshine-spotless/index.html',target:'sunshine-spotless/index.html',marker:'sunshine-spotless-continuity-20261018'},
 {source:'public/apps/eps-estimator/index.html',target:'apps/eps-estimator/index.html',marker:'EPS Precise Estimator'}
];
const sha256=input=>'sha256:'+createHash('sha256').update(input).digest('hex');
const inside=(parent,child)=>{const r=path.relative(parent,child);return r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)};
export function buildServiceContinuityRelease({root=process.cwd(),output=path.join(process.cwd(),'artifacts/eps-havenly-continuity'),release=process.env.GITHUB_SHA||'local-unbound'}={}){
 root=path.resolve(root);output=path.resolve(output);
 if(!inside(root,output)||!inside(path.join(root,'artifacts'),output))throw new Error('output_must_be_under_repository_artifacts');
 const site=path.join(output,'site');
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(site,{recursive:true});
 const files=[];
 for(const item of sources){
  const content=fs.readFileSync(path.join(root,item.source));
  const html=content.toString('utf8');
  if(!html.includes(item.marker))throw new Error('missing_release_marker:'+item.source);
  if(/base44\.app|@base44|base44Client|base44-prod/i.test(html))throw new Error('legacy_runtime_dependency:'+item.source);
  const target=path.join(site,item.target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
  files.push({path:item.target,bytes:content.length,sha256:sha256(content),marker:item.marker});
 }
 const landing=[
 '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Local Services</title><meta name="robots" content="noindex"></head>',
 '<body style="font:16px/1.6 system-ui;max-width:720px;margin:3rem auto;padding:0 1.5rem;background:#f7f8f9;color:#121820">',
 '<h1>Evercraft Local Services</h1><p>Choose the service you need. Requests open in your own text or email app. They are not automatically submitted.</p>',
 '<p><a href="./eps/">Evercraft Property Services</a></p><p><a href="./havenly/">HAVENLY Cleaning</a></p><p><a href="./sunshine-spotless/">Sunshine &amp; Spotless Cleaning Co</a></p></body></html>'
 ].join('\n');
 const bytes=Buffer.from(landing,'utf8');fs.writeFileSync(path.join(site,'index.html'),bytes);
 files.push({path:'index.html',bytes:bytes.length,sha256:sha256(bytes)});
 fs.writeFileSync(path.join(site,'.nojekyll'),'');
 const receipt={schema:'evercraft.eps-havenly.portable-release.v1',source_release_ref:release,deployment_state:'not_deployed',
 evidence_state:'portable_artifact_only',source_canonical:'github',source_dependency_base44:false,
 production_record_exported:false,production_booking_enabled:false,server_side_intake_enabled:false,
 customer_obligation_created:false,intended_mount:'https-root',files,manifest_hash:sha256(JSON.stringify(files))};
 fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const r=buildServiceContinuityRelease();console.log(JSON.stringify({state:r.evidence_state,manifest_hash:r.manifest_hash,files:r.files.length}))}
 catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1}
}
