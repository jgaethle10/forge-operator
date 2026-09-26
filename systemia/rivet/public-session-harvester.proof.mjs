import assert from 'node:assert/strict';
import { aggregateSessionRows, harvestSource } from './public-session-harvester.mjs';

const source={
  source_id:'fixture',
  name:'Fixture',
  jurisdiction:'WA',
  country:'US',
  authority:'public',
  auto_harvest:true,
  transport:'socrata',
  endpoint:'https://example.test/sessions',
  period_date_field:'date',
  reject_if_invalidity_present:true
};
const rows=[
  {date:'2026-09-01T00:00:00.000',station_name:'Station A',location_name:'Main Garage',connected_time:'08:00:00.0000000',energy_provided_kwh:'7.5',driver_id:'session-a',id_tag:'private-tag-a'},
  {date:'2026-09-01T00:00:00.000',station_name:'Station A',location_name:'Main Garage',connected_time:'10:00:00.0000000',energy_provided_kwh:'12.5',driver_id:'session-b',id_tag:'private-tag-b'},
  {date:'2026-09-01T00:00:00.000',station_name:'Station A',location_name:'Main Garage',connected_time:'10:00:00.0000000',energy_provided_kwh:'12.5',driver_id:'session-b',id_tag:'private-tag-b'},
  {date:'2026-09-02T00:00:00.000',station_name:'Station B',location_name:'Second Garage',energy_provided_kwh:'4.25',driver_id:'session-c'},
  {date:'2026-09-03T00:00:00.000',station_name:'Station C',location_name:'Third Garage',driver_id:'session-d',invalidity_reason:'invalid transaction'}
];

const aggregated=aggregateSessionRows(rows,source);
assert.equal(aggregated.aggregates.length,2);
assert.equal(aggregated.rejected_rows,1);
assert.equal(aggregated.duplicate_rows_dropped,1);
const stationA=aggregated.aggregates.find(r=>r.station_external_id==='Station A');
assert.equal(stationA.charging_sessions_count,2);
assert.equal(stationA.energy_kwh,20);
assert.equal(stationA.site_label,'Main Garage');

const serialized=JSON.stringify(aggregated);
for(const secret of ['session-a','session-b','session-c','private-tag-a','private-tag-b']){
  assert.equal(serialized.includes(secret),false);
}

const fakeFetch=async()=>({ok:true,status:200,json:async()=>rows});
const harvested=await harvestSource(source,{fetchImpl:fakeFetch,maxPages:1});
assert.equal(harvested.status,'HARVESTED');
assert.equal(harvested.raw_session_rows_seen,5);
assert.equal(harvested.accepted_aggregate_rows,2);
assert.equal(harvested.duplicate_rows_dropped,1);

const restricted=await harvestSource({...source,source_id:'restricted',authority:'token_required',auto_harvest:false},{
  fetchImpl:async()=>{throw new Error('must not fetch');}
});
assert.equal(restricted.status,'SKIPPED_AUTHORITY_OR_MANUAL');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.session-harvester-proof.v1',
  privacy_drop_identifiers:true,
  duplicate_suppression:true,
  invalid_session_rejection:true,
  accepted_aggregate_rows:aggregated.aggregates.length
}));
