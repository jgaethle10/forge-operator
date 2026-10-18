#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {compileInfluenceBrief} from './influence-lab.mjs';
import {planInfluenceGraphics} from './graphics-bridge.mjs';
import {renderInfluenceConceptCollection} from './concept-renderer.mjs';

const get=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const briefPath=get('--brief'),referencePath=get('--reference'),output=get('--out');
if(!briefPath||!referencePath||!output){
  console.error('usage: node systemia/influence-lab/render-concepts.mjs --brief <json> --reference <existing-graphics-campaign.json> --out <new-empty-directory>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(fs.readFileSync(path.resolve(briefPath),'utf8'));
    const original=JSON.parse(fs.readFileSync(path.resolve(referencePath),'utf8'));
    const brief=compileInfluenceBrief(input);
    const slate=planInfluenceGraphics({brief,referenceCampaign:original});
    const preview=renderInfluenceConceptCollection(slate);
    const dir=path.resolve(output);
    fs.mkdirSync(dir,{recursive:false,mode:0o700});
    const assets=[];
    for(const [key,formats] of Object.entries(preview.outputs)){
      for(const [format,svg] of Object.entries(formats)){
        const name=key+'-'+format+'.svg';
        fs.writeFileSync(path.join(dir,name),svg,{flag:'wx',mode:0o600});
        assets.push({key,format,filename:name});
      }
    }
    const manifest={schema:'evercraft.influence-lab.preview-manifest.v1',campaignId:brief.campaignId,
      briefDigest:brief.digest,graphicsSlateDigest:slate.digest,
      state:'concept_only',assets,sourceMediaVerified:false,paymentVerified:false,
      publicationAuthority:false,externalContactAuthorized:false};
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    const tiles=assets.filter(asset=>asset.format==='feed').map(asset=>'<figure><img src="./'+asset.filename+'" alt="'+asset.key+' concept study, not real product footage"><figcaption>'+asset.key.toUpperCase()+' • Concept-only</figcaption></figure>').join('');
    const gallery='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Influence Lab / Review Only</title><style>body{margin:0;background:#0d1117;color:#eee;font:16px system-ui;padding:24px}h1{font-size:23px}p{color:#bbb}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}figure{margin:0}img{width:100%;height:auto;border-radius:10px}figcaption{padding:12px}</style></head><body><h1>Evercraft Influence Lab</h1><p>Unpublished concept studies. Real footage, verified offers and separate authority required before any campaign.</p><main>'+tiles+'</main></body></html>';
    fs.writeFileSync(path.join(dir,'index.html'),gallery,{flag:'wx'});
    console.log(JSON.stringify({ok:true,output:dir,manifest:'manifest.json',concepts:assets.length,
      state:manifest.state,publicationAuthority:false}));
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
