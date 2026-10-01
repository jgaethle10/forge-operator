#!/usr/bin/env node
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { previewStaleShifts, runAutoClockOut } from './auto-clock-out.mjs';

function arg(name,fallback=''){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]||fallback:fallback;
}
const stateDir=arg('--state-dir',process.env.EVERCRAFT_APP_FABRIC_STATE_DIR||'');
const appKey=arg('--app-key',process.env.EVERCRAFT_APP_KEY||'');
const cutoffHours=Number(arg('--cutoff-hours',process.env.EVERCRAFT_AUTO_CLOCK_OUT_HOURS||'12'));
const dryRun=process.argv.includes('--dry-run');

if(!stateDir) throw new Error('auto_clock_out_state_dir_required');
if(!appKey) throw new Error('auto_clock_out_app_key_required');

const store=new DurableEntityStore({stateDir:path.resolve(stateDir)});
if(dryRun){
  const rows=previewStaleShifts({entityStore:store,appKey,now:new Date(),cutoffHours});
  console.log(JSON.stringify({
    schema:'evercraft.operations.auto-clock-out-preview.v1',
    app_key:appKey,
    cutoff_hours:cutoffHours,
    stale_shift_count:rows.length,
    mutation_authority:false,
    row_ids_emitted:false
  },null,2));
}else{
  console.log(JSON.stringify(runAutoClockOut({
    entityStore:store,
    appKey,
    now:new Date(),
    cutoffHours
  }),null,2));
}
