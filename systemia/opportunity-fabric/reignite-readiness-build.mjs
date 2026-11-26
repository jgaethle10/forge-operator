#!/usr/bin/env node
/** Regenerate or verify REIGNITE's unindexed readiness preview from canonical gates. */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderReigniteReadinessHtml } from './reignite-readiness-page.mjs';

const file=new URL('../../public/reignite/readiness/index.html',import.meta.url);
const action=process.argv[2];
if(!['--check','--write'].includes(action)){
  process.stderr.write('Usage: node systemia/opportunity-fabric/reignite-readiness-build.mjs --check|--write\n');
  process.exitCode=2;
}else{
  const html=renderReigniteReadinessHtml();
  if(action==='--write'){
    writeFileSync(file,html,'utf8');
    process.stdout.write('REIGNITE source-only readiness preview regenerated. No deployment performed.\n');
  }else{
    try{
      const recorded=readFileSync(file,'utf8');
      if(recorded!==html){
        process.stderr.write('HOLD: readiness HTML differs from canonical event gates. Use --write and review the diff.\n');
        process.exitCode=1;
      }else process.stdout.write('PASS: REIGNITE preview matches canonical gates, all permissions remain denied.\n');
    }catch(error){
      process.stderr.write('HOLD: readiness HTML cannot be verified: '+error.message+'\n');
      process.exitCode=1;
    }
  }
}
