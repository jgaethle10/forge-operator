import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUsgsEarthquakes } from '../radar/collectors.mjs';
import {
  emptyRadarState,
  ingestRadarObservation,
  compileRadarEdition,
} from '../radar/core.mjs';
import {
  scoreRadarSignalForVisual,
  rankRadarVisualCandidates,
  compileRadarVisualStory,
} from './radar-adapter.mjs';
import { normalizeVisualStory } from './factory.mjs';

test('USGS collector preserves source geometry instead of discarding it',async()=>{
  const generated=Date.parse('2026-10-07T01:00:00Z');
  const fetchImpl=async()=>({
    ok:true,
    async json(){
      return {
        metadata:{generated,count:1},
        features:[{
          id:'us7000test',
          geometry:{coordinates:[-121.75,46.85,12.4]},
          properties:{
            mag:5.8,
            place:'20 km NE of Test Peak',
            time:generated-60000,
            status:'reviewed',
            tsunami:0,
            url:'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test'
          }
        }]
      };
    }
  });
  const run=await collectUsgsEarthquakes({fetchImpl,now:'2026-10-07T01:00:00Z'});
  const row=run.observations[0].measurements[0];
  assert.equal(row.latitude,46.85);
  assert.equal(row.longitude,-121.75);
  assert.equal(row.depth_km,12.4);
  assert.equal(row.source_url,'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test');
});

test('Radar edition carries safe visual points from geolocated measurements',()=>{
  const now='2026-10-07T01:00:00Z';
  const observation={
    source_system:'test-radar',
    source_family:'authoritative-test-source',
    observed_at:now,
    region_key:'cascadia',
    domains:['geophysics','earth_hazards'],
    kind:'seismic_feed_state',
    evidence_state:'observed',
    reliability:0.99,
    anomaly_score:0.95,
    summary:'Two source-backed seismic measurements changed materially.',
    provenance_refs:['https://example.gov/feed'],
    correlation_keys:['test:seismic'],
    facts:{subject_key:'test:seismic'},
    measurements:[
      {event_id:'a',magnitude:5.9,place:'North point',latitude:47.2,longitude:-122.1,depth_km:8,source_url:'https://example.gov/a'},
      {event_id:'b',magnitude:5.5,place:'South point',latitude:45.8,longitude:-121.9,depth_km:11,source_url:'https://example.gov/b'},
    ],
  };
  const ingested=ingestRadarObservation(emptyRadarState(),observation,{now});
  const {edition}=compileRadarEdition(ingested.state,{now,materiality_threshold:0,max_signals:8});
  assert.equal(edition.signals.length,1);
  assert.equal(edition.signals[0].visual_points.length,2);
  assert.deepEqual(
    edition.signals[0].visual_points.map((point)=>[point.id,point.lat,point.lon]),
    [['a',47.2,-122.1],['b',45.8,-121.9]]
  );
  assert.equal(edition.signals[0].visual_points[0].note,'M5.9 • 8.0 km deep');
});

test('Radar visual admission exposes auditable score factors and emits a valid Visual Desk story',()=>{
  const edition={
    schema:'evercraft.systemia-radar.edition.v1',
    edition_id:'radar-edition:test',
    generated_at:'2026-10-07T01:00:00Z',
    signals:[{
      signal_id:'radar:test',
      observation_id:'obs:test',
      subject_key:'test',
      summary:'USGS recorded several strong earthquakes across the Pacific basin.',
      truth_state:'OBSERVED',
      change_state:'NEW',
      materiality_score:0.88,
      anomaly_score:0.91,
      reliability:0.98,
      observed_at:'2026-10-07T00:59:00Z',
      last_verified_at:'2026-10-07T01:00:00Z',
      domains:['geophysics','earth_hazards'],
      source_family:'usgs-earthquake-hazards',
      provenance_refs:['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'],
      review:{status:'pass',freshness:{state:'fresh'}},
      visual_points:[
        {id:'a',label:'A',lat:48,lon:-123,value:6.1,note:'M6.1',source_ref:'https://earthquake.usgs.gov/a'},
        {id:'b',label:'B',lat:44,lon:-125,value:5.6,note:'M5.6',source_ref:'https://earthquake.usgs.gov/b'},
        {id:'c',label:'C',lat:40,lon:-127,value:5.2,note:'M5.2',source_ref:'https://earthquake.usgs.gov/c'},
      ],
    }],
  };

  const scored=scoreRadarSignalForVisual(edition.signals[0]);
  assert.equal(scored.admissible,true);
  assert.ok(scored.score>=0.58);
  assert.deepEqual(
    Object.keys(scored.factors).sort(),
    ['anomaly','change','freshness','materiality','reliability','source_density','spatial_richness','truth'].sort()
  );

  const admission=rankRadarVisualCandidates(edition,{minScore:0.58});
  assert.equal(admission.admitted.length,1);
  assert.equal(admission.publicationAuthority,false);

  const compiled=compileRadarVisualStory(admission.admitted[0]);
  assert.equal(compiled.publicationAuthority,false);
  assert.equal(compiled.story.lines.length,0,'spatial points must not be connected into a causal-looking route');
  assert.match(compiled.story.narrative,/does not convert co-occurrence into causation/i);
  const normalized=normalizeVisualStory(compiled.story);
  assert.equal(normalized.points.length,3);
  assert.equal(normalized.evidenceState,'observed');
  assert.ok(normalized.sourceRefs.length>=3);
});

test('political Radar signals are held out of unattended visual admission',()=>{
  const signal={
    signal_id:'radar:politics',
    observation_id:'obs:politics',
    summary:'Reported government statement.',
    truth_state:'REPORTED',
    change_state:'NEW',
    materiality_score:1,
    anomaly_score:1,
    reliability:1,
    domains:['government'],
    provenance_refs:['https://example.gov/source'],
    review:{status:'pass',freshness:{state:'fresh'}},
    visual_points:[{id:'x',label:'X',lat:40,lon:-100,value:1,note:'',source_ref:''}],
  };
  const scored=scoreRadarSignalForVisual(signal);
  assert.equal(scored.admissible,false);
  assert.ok(scored.blockers.includes('political_visual_requires_editorial_review'));
});
