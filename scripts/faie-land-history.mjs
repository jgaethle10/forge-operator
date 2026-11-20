#!/usr/bin/env node
// Owner-operated history curator. No anonymous web write route or crawler.
// The manifest contains sourced public regional metadata, never individual data.
import fs from 'node:fs';
import path from 'node:path';
import {openFaieLandHistory} from '../systemia/faie/land-history-ledger.mjs';

const command=process.argv[2];
const root=process.env.FAIE_EDGE_STATE_DIR;
if(!root||!path.isAbsolute(root)||root===path.parse(root).root){
  process.stderr.write('HOLD: configure an absolute, owned FAIE_EDGE_STATE_DIR before historical preservation.\n');
  process.exit(2);
}
const dbPath=path.join(root,'history','faie-land-history.sqlite');
const store=openFaieLandHistory({databasePath:dbPath});
try{
  if(command==='status'){
    process.stdout.write(JSON.stringify({
      ...store.stats(),integrity:store.verifyChain(),storage:'owned_operator_managed_sqlite',
      archival_authority:'curated_public_sources_only'
    },null,2)+'\n');
  }else if(command==='timeline'){
    const region=process.argv[3];
    process.stdout.write(JSON.stringify({
      schema:'evercraft.faie.owner-history-timeline.v1',
      public_region:region,
      complete_historical_coverage:false,
      records:store.listLand('region:'+region,{limit:1000})
    },null,2)+'\n');
  }else if(command==='import'){
    const manifestPath=process.argv[3];
    if(!manifestPath)throw new Error('manifest_path_required');
    const parsed=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(parsed.schema!=='evercraft.faie.curated-public-history.v1'||
       !Array.isArray(parsed.records)||parsed.records.length<1||parsed.records.length>100){
      throw new Error('invalid_bounded_public_history_manifest');
    }
    // A dry-run validates every row without touching the persistent store.
    const trial=openFaieLandHistory({databasePath:':memory:'});
    try{for(const item of parsed.records)trial.archive(item)}finally{trial.close()}
    if(!process.argv.includes('--apply')){
      process.stdout.write(JSON.stringify({
        state:'VALIDATED_DRY_RUN_ONLY',records:parsed.records.length,
        database_mutated:false,
        instructions:'Set FAIE_HISTORY_CURATOR_APPROVED=yes and rerun with --apply after source review.'
      },null,2)+'\n');
    }else{
      if(process.env.FAIE_HISTORY_CURATOR_APPROVED!=='yes'){
        throw new Error('owner_explicit_history_import_approval_required');
      }
      let archived=0,deduped=0;
      for(const item of parsed.records){
        const receipt=store.archive(item);
        if(receipt.action==='archived')archived++;
        if(receipt.action==='deduped')deduped++;
      }
      process.stdout.write(JSON.stringify({
        state:'OWNER_PUBLIC_HISTORY_IMPORTED',
        imported:archived,deduplicated:deduped,
        integrity:store.verifyChain(),
        authorization:'explicit_owner_only'
      },null,2)+'\n');
    }
  }else{
    throw new Error('usage: faie-land-history.mjs status | timeline <region> | import <manifest.json> [--apply]');
  }
}catch(error){
  process.stderr.write('HOLD: '+String(error?.message||error)+'\n');
  process.exitCode=1;
}finally{
  store.close();
}
