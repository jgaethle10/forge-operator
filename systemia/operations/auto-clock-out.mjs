function clean(value,max=4000){ return String(value??'').trim().slice(0,max); }

export function previewStaleShifts({
  entityStore,
  appKey,
  now=new Date(),
  cutoffHours=12
}={}){
  if(!entityStore) throw new Error('auto_clock_out_entity_store_required');
  const key=clean(appKey,127);
  if(!key) throw new Error('auto_clock_out_app_key_required');
  const at=new Date(now);
  const cutoff=new Date(at.getTime()-Math.max(1,Number(cutoffHours)||12)*60*60*1000);
  const open=entityStore.filter(key,'TimeLog',{is_clocked_in:true},{limit:10000});
  return open.filter((log)=>{
    if(!log.start_time) return false;
    const start=new Date(log.start_time);
    return Number.isFinite(start.getTime())&&start<cutoff;
  });
}

export function runAutoClockOut({
  entityStore,
  appKey,
  now=new Date(),
  cutoffHours=12
}={}){
  const key=clean(appKey,127);
  const at=new Date(now);
  const stale=previewStaleShifts({entityStore,appKey:key,now:at,cutoffHours});
  const results=[];

  for(const log of stale){
    const start=new Date(log.start_time);
    const totalHours=Number(((at-start)/(1000*60*60)).toFixed(4));
    const endTime=at.toISOString();
    const updated=entityStore.update(key,'TimeLog',log.id,{
      is_clocked_in:false,
      end_time:endTime,
      total_hours:totalHours,
      status:'Submitted',
      notes:(log.notes?String(log.notes)+'\n':'')+'Auto-closed due to inactivity',
      field_status:'Completed'
    }).record;

    entityStore.create(key,'ActionLog',{
      action_type:'auto_clock_out',
      target_type:'time_log',
      target_id:log.id,
      target_name:`${clean(log.team_member_id,255)} – ${start.toISOString().slice(0,10)}`,
      user_id:'system',
      user_email:'system@auto',
      user_name:'Auto System',
      user_role:'system',
      previous_value:JSON.stringify({is_clocked_in:true,end_time:null}),
      new_value:JSON.stringify({
        is_clocked_in:false,
        end_time:endTime,
        total_hours:totalHours,
        status:'Submitted'
      }),
      metadata:{
        reason:`Auto-closed due to inactivity (open > ${Math.max(1,Number(cutoffHours)||12)} hours)`,
        triggered_at:endTime,
        total_hours:totalHours,
        job_id:log.job_id||null
      }
    },{now:at});

    results.push({
      id:updated.id,
      total_hours:totalHours,
      mutation_state:'closed'
    });
  }

  return {
    schema:'evercraft.operations.auto-clock-out-result.v1',
    app_key:key,
    cutoff_hours:Math.max(1,Number(cutoffHours)||12),
    observed_at:at.toISOString(),
    closed:results.length,
    logs:results,
    idempotent_on_closed_rows:true
  };
}
