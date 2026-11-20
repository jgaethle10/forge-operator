import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openFaieLandHistory,publicHistoryFromOfficialObservation} from './land-history-ledger.mjs';

const record=(overrides={})=>({
  land_id:'region:yakima-wa',source_family:'usgs-water-data-api',source_record_id:'usgs-site-1',
  category:'official_observation',evidence_state:'OBSERVED',
  event_start:'2026-11-19',time_precision:'day',
  summary:'Official USGS observed streamflow value at a published monitoring station.',
  source_url:'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items/1?f=json',
  geography_scope:'USGS monitoring region, not an individual property',
  metadata:{metric_value:20,metric_unit:'cfs'},...overrides
});
function fixture(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-history-ledger-'));
  const file=path.join(dir,'history.sqlite');
  const db=openFaieLandHistory({databasePath:file});
  try{return fn({db,file})}finally{db.close();fs.rmSync(dir,{force:true,recursive:true})}
}
test('history ledger preserves changed source versions, dedupes repeated scans and sorts a regional timeline',()=>fixture(({db})=>{
  assert.equal(db.archive(record()).action,'archived');
  assert.equal(db.archive(record({first_collected_at:'2026-11-20T00:01:00Z'})).action,'deduped');
  assert.equal(db.archive(record({summary:'Official USGS revised streamflow after verification.'})).action,'archived');
  assert.equal(db.archive(record({
    source_family:'us-drought-monitor-ndmc',source_record_id:'2024-drought',
    category:'historical_record',event_start:'2024-01-01',event_end:'2024-12-31',
    time_precision:'year',evidence_state:'REPORTED',
    source_url:'https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent',
    summary:'2024 county-scale official drought assessment preserved with year precision.'
  })).action,'archived');
  const history=db.listLand('region:yakima-wa');
  assert.equal(history.length,3);
  assert.equal(history[0].event_start,'2024-01-01');
  assert.equal(history[0].time_precision,'year');
  assert.equal(db.stats().archived_records,3);
  assert.equal(db.stats().public_regions,1);
  assert.equal(db.verifyChain().ok,true);
}));
test('the actual SQLite database survives close and reopening with the same source receipt',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-history-persist-'));
  const file=path.join(dir,'evercraft-land.sqlite');
  try{
    const db=openFaieLandHistory({databasePath:file});
    db.archive(record());
    const tip=db.verifyChain().tip_sha256;
    db.close();
    const restored=openFaieLandHistory({databasePath:file});
    assert.equal(restored.stats().archived_records,1);
    assert.equal(restored.verifyChain().tip_sha256,tip);
    assert.equal(restored.listLand('region:yakima-wa')[0].source_record_id,'usgs-site-1');
    restored.close();
    assert.equal(fs.statSync(file).mode&0o777,0o600);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('a modified historical fact breaks chain verification',()=>fixture(({db,file})=>{
  db.archive(record());
  db.archive(record({source_record_id:'site-2',summary:'Another published official streamflow record.'}));
  assert.equal(db.verifyChain().checked,2);
  const bypass=new DatabaseSync(file);
  bypass.exec("UPDATE records SET summary='rewritten past' WHERE id=1");
  bypass.close();
  assert.deepEqual(db.verifyChain(),{ok:false,checked:0,failed_record_id:1});
}));
test('rejects private sites, invented date precision and unapproved external sources',()=>fixture(({db})=>{
  for(const land_id of ['point:46.6021,-120.5059','site:my-property','region:global','region:46.6021,-120.5059']){
    assert.throws(()=>db.archive(record({land_id})),/named_public_region_required/);
  }
  assert.throws(()=>db.archive(record({source_url:'https://evil.example/flood'})),/source_not_authorized/);
  assert.throws(()=>db.archive(record({event_start:'2026-02-30'})),/invalid_date/);
  assert.throws(()=>db.archive(record({event_start:'2026-11-19',event_end:'2020-01-01'})),/inverted_history_time_range/);
  assert.throws(()=>db.archive(record({category:'private_deed_owner'})),/invalid_history/);
  assert.throws(()=>db.archive(record({usage_rights:'scrape_and_republish'})),/source_rights_required/);
}));
test('only official, cited, publicly scoped observations enter the ledger',()=>fixture(({db})=>{
  const observation={
    observation_id:'usgs-0001',source_system:'systemia_sentinel_official',
    source_family:'usgs-water-data-api',
    observed_at:'2026-11-19T10:00:00Z',region_keys:['yakima-wa'],
    kind:'stream_flow',evidence_state:'observed',
    summary:'Yakima official streamflow observation, 42 cubic feet per second.',
    provenance_refs:['https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items/1?f=json'],
    facts:{metric_value:42,metric_unit:'cfs',private_address:'must never enter archive'}
  };
  assert.equal(db.archiveOfficialObservation(observation).action,'archived');
  assert.equal(db.archiveOfficialObservation(observation).action,'deduped');
  const found=db.listLand('region:yakima-wa')[0];
  assert.equal(found.metadata.metric_value,'42');
  assert.equal(found.event_start,'2026-11-19');
  assert.ok(!JSON.stringify(found).includes('private_address'));
  assert.equal(db.archiveOfficialObservation({...observation,source_system:'systemia_radar'}).action,'skipped');
  assert.equal(db.archiveOfficialObservation({...observation,region_keys:['global']}).action,'skipped');
  assert.equal(db.archiveOfficialObservation({...observation,source_family:'random-twitter-feed'}).action,'skipped');
  assert.equal(publicHistoryFromOfficialObservation({...observation,provenance_refs:['https://evil.example/data']}),null);
  assert.equal(db.stats().archived_records,1);
}));
test('historical-map source metadata can be preserved without copying copyrighted map scans',()=>fixture(({db})=>{
  db.archive({
    land_id:'region:yakima-wa',source_family:'usgs-historical-topo',
    source_record_id:'historic-sheet-1912',category:'historical_map',
    evidence_state:'REPORTED',time_precision:'year',
    event_start:'1912-01-01',event_end:'1912-12-31',
    summary:'Historical map-sheet catalog metadata references a 1912 topographic map.',
    source_url:'https://ngmdb.usgs.gov/topoview/viewer/',
    source_published_at:null,geography_scope:'named map-sheet coverage, exact polygon not yet verified',
    usage_rights:'metadata_only_rights_unverified',
    metadata:{map_sheet_id:'historic-sheet-1912',copyrighted_image_url:'not included'}
  });
  const item=db.listLand('region:yakima-wa')[0];
  assert.equal(item.category,'historical_map');
  assert.equal(item.time_precision,'year');
  assert.equal(item.metadata.map_sheet_id,'historic-sheet-1912');
  assert.ok(!JSON.stringify(item).includes('copyrighted_image_url'));
  assert.equal(item.usage_rights,'metadata_only_rights_unverified');
}));
