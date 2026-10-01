#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { previewStaleShifts, runAutoClockOut } from './auto-clock-out.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-auto-clock-out-proof-'));
const now=new Date('2026-10-01T16:00:00.000Z');

try{
  const store=new DurableEntityStore({stateDir:path.join(root,'entities')});
  const appKey='systemia-remote-ops';

  store.create(appKey,'TimeLog',{
    id:'stale-open',
    team_member_id:'member-a',
    job_id:'job-a',
    start_time:'2026-10-01T02:00:00.000Z',
    is_clocked_in:true,
    notes:'Existing note'
  });
  store.create(appKey,'TimeLog',{
    id:'recent-open',
    team_member_id:'member-b',
    start_time:'2026-10-01T10:00:00.000Z',
    is_clocked_in:true
  });
  store.create(appKey,'TimeLog',{
    id:'already-closed',
    team_member_id:'member-c',
    start_time:'2026-09-30T20:00:00.000Z',
    is_clocked_in:false,
    end_time:'2026-10-01T01:00:00.000Z'
  });

  const preview=previewStaleShifts({entityStore:store,appKey,now,cutoffHours:12});
  assert.deepEqual(preview.map((row)=>row.id),['stale-open']);

  const first=runAutoClockOut({entityStore:store,appKey,now,cutoffHours:12});
  assert.equal(first.closed,1);
  assert.equal(first.logs[0].id,'stale-open');
  assert.equal(first.logs[0].total_hours,14);

  const stale=store.get(appKey,'TimeLog','stale-open');
  assert.equal(stale.is_clocked_in,false);
  assert.equal(stale.end_time,'2026-10-01T16:00:00.000Z');
  assert.equal(stale.total_hours,14);
  assert.equal(stale.status,'Submitted');
  assert.equal(stale.field_status,'Completed');
  assert.match(stale.notes,/Existing note\nAuto-closed due to inactivity/);

  const recent=store.get(appKey,'TimeLog','recent-open');
  assert.equal(recent.is_clocked_in,true);

  const actions=store.filter(appKey,'ActionLog',{action_type:'auto_clock_out'},{limit:100});
  assert.equal(actions.length,1);
  assert.equal(actions[0].target_id,'stale-open');
  assert.equal(actions[0].user_id,'system');
  assert.equal(actions[0].metadata.job_id,'job-a');

  const second=runAutoClockOut({
    entityStore:store,
    appKey,
    now:new Date('2026-10-01T16:05:00.000Z'),
    cutoffHours:12
  });
  assert.equal(second.closed,0);
  assert.equal(
    store.filter(appKey,'ActionLog',{action_type:'auto_clock_out'},{limit:100}).length,
    1
  );

  console.log(JSON.stringify({
    schema:'evercraft.operations.auto-clock-out-proof.v1',
    status:'pass',
    stale_open_shift_closed:true,
    recent_shift_preserved:true,
    already_closed_shift_preserved:true,
    total_hours_preserved:true,
    action_log_written:true,
    rerun_idempotent:true
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
