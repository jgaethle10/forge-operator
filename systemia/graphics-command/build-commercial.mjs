#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildCommercialCampaign } from './commercial-renderer.mjs';
import { assembleGraphicsProductionMesh } from './production-mesh.mjs';
import { runAssignment, reconcile } from '../media-studio/creative-council-saban-adapter.mjs';

function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:undefined;
}

async function main(){
  const campaignPath=arg('--campaign');
  const outputRoot=arg('--output');
  const origin=arg('--origin')||'https://fabric.systemiacommandcenters.com/visuals';
  if(!campaignPath||!outputRoot){
    throw new Error('Usage: node systemia/graphics-command/build-commercial.mjs --campaign <campaign.json> --output <dir> [--origin <url>]');
  }

  const campaign=JSON.parse(fs.readFileSync(path.resolve(campaignPath),'utf8'));
  const built=buildCommercialCampaign(campaign,{outputRoot:path.resolve(outputRoot),origin});
  const results=[];

  for(const job of built.plan.council.shots){
    for(const role of built.plan.council.roles){
      results.push(await runAssignment({
        assignment:{
          agent_id:'graphics-command:'+role,
          role,
          item:{shot:job.shot},
        }
      }));
    }
  }

  const reconciliation=await reconcile({
    results,
    plan:{roles:built.plan.council.roles},
  });

  const councilPath=path.join(built.dir,'creative-council-reconciliation.json');
  fs.writeFileSync(councilPath,JSON.stringify(reconciliation,null,2)+'\n','utf8');

  const mesh=assembleGraphicsProductionMesh({
    dir:built.dir,
    campaign:built.campaign,
    plan:built.plan,
    report:built.report,
    manifest:built.manifest,
    reconciliation,
  });

  const receipt={
    schema:'evercraft.graphics-command.commercial-build-receipt.v1',
    campaignId:built.campaign.id,
    campaignSlug:built.campaign.slug,
    campaignDigest:built.campaign.digest,
    planDigest:built.plan.digest,
    scrollStopStatus:built.report.status,
    scrollStopScore:built.report.score,
    councilStatus:reconciliation.status,
    councilShotCount:reconciliation.shot_count,
    councilBlockedShotCount:reconciliation.blocked_shot_count,
    productionMeshDigest:mesh.receipt.digest,
    productionMeshStatus:mesh.receipt.status,
    customerReady:mesh.receipt.customerReady,
    assets:built.manifest.assets,
    offerUrl:built.manifest.offerUrl,
    publicationAuthority:false,
    builtAt:new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(built.dir,'commercial-build-receipt.json'),
    JSON.stringify(receipt,null,2)+'\n',
    'utf8'
  );
  console.log(JSON.stringify(receipt,null,2));
}

main().catch(error=>{
  console.error(error instanceof Error?error.stack||error.message:String(error));
  process.exitCode=1;
});
