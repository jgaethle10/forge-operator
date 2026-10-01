import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emptyContextState, ingestContextObservation } from '../worldstate/observation-fabric.mjs';
import {
  assessSpectacleDispatch,
  buildSpectacleQueue,
  runSpectacleCycle,
} from './social-spectacle-engine.mjs';

const phenomenonObservation={
  observation_id:'obs-puget-current-001',
  source_system:'worldstate',
  source_family:'NOAA operational forecast',
  observed_at:'2026-09-30T22:00:00Z',
  region_keys:['puget-sound'],
  domains:['ocean','water'],
  kind:'surface_currents',
  evidence_state:'modeled',
  reliability:.94,
  anomaly_score:.88,
  novelty_score:.9,
  provenance_refs:['noaa:sscofs:2026-09-30T22'],
  correlation_keys:['puget-sound::ocean::surface_currents'],
  facts:{
    phenomenon:{
      kind:'flow',
      title:'A Week of Currents',
      geography:{bounds:{north:48.5,south:46.9,west:-123.5,east:-121.8}},
      encoding:{motionLabel:'surface-current direction'},
      streamlines:[{id:'s',points:[{lat:47.4,lon:-122.7},{lat:47.2,lon:-122.5}]}]
    }
  }
};

const accepted=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle',priority:'high'},
  observation:phenomenonObservation,
  recentSubjects:[],
  brandKey:'evercraft',
});
assert.equal(accepted.action,'candidate');
assert.equal(accepted.candidate.production.visual_path,'fallen_phenomenon');
assert.equal(accepted.candidate.gates.publication_authority,false);
assert.equal(accepted.candidate.editorial.no_one_line_staccato,true);
assert.ok(accepted.candidate.wonder_score>=.7);

const repeat=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle'},
  observation:phenomenonObservation,
  recentSubjects:['puget-sound::ocean::surface_currents'],
  brandKey:'evercraft',
});
assert.notEqual(repeat.action,'candidate');

const blocked=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle'},
  observation:phenomenonObservation,
  brandKey:'rnb-chicken-and-soul',
});
assert.equal(blocked.action,'hold');
assert.equal(blocked.reason,'brand_explicitly_blocked');

const political=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle'},
  observation:{...phenomenonObservation,domains:['public_policy']},
  brandKey:'evercraft',
});
assert.equal(political.action,'hold');
assert.equal(political.reason,'high_stakes_requires_editorial_gate');

const boring=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle'},
  observation:{
    ...phenomenonObservation,
    facts:{},
    measurements:[],
    media_refs:[],
    anomaly_score:.1,
  },
});
assert.equal(boring.action,'background');
assert.equal(boring.reason,'no_visual_story_path');

const queue=buildSpectacleQueue({
  assessments:[accepted],
  recentSubjects:[],
  publishedToday:0,
  now:new Date('2026-09-30T23:00:00Z'),
});
assert.equal(queue.queue_count,1);
assert.equal(queue.publication_authority,false);
assert.match(queue.quality_rule,/no-op is better than a boring post/);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'social-spectacle-'));
const inputFile=path.join(root,'input.json');
fs.writeFileSync(inputFile,JSON.stringify({
  items:[{dispatch:{consumer:'social_spectacle',priority:'high'},observation:phenomenonObservation,brand_key:'evercraft'}]
},null,2));
const cycle=runSpectacleCycle({
  inputFile,
  stateDir:root,
  now:new Date('2026-09-30T23:05:00Z'),
});
assert.equal(cycle.receipt.queue_count,1);
assert.equal(cycle.receipt.publication_authority,false);
assert.equal(fs.existsSync(path.join(root,'latest-queue.json')),true);
assert.equal(fs.existsSync(path.join(root,'receipts.jsonl')),true);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.social-spectacle.proof.v1',
  hero_candidate_admitted:true,
  boring_visuals_rejected:true,
  blocked_brand_held:true,
  high_stakes_auto_hold:true,
  repeat_penalty_enforced:true,
  publication_authority_preserved:true,
},null,2));


const contextRoot=fs.mkdtempSync(path.join(os.tmpdir(),'social-spectacle-context-'));
let contextState=emptyContextState();
contextState=ingestContextObservation(contextState,phenomenonObservation).state;
const contextFile=path.join(contextRoot,'context-state.json');
fs.writeFileSync(contextFile,JSON.stringify(contextState,null,2));
const contextCycle=runSpectacleCycle({
  contextStateFile:contextFile,
  stateDir:path.join(contextRoot,'spectacle-state'),
  now:new Date('2026-09-30T23:10:00Z'),
});
assert.equal(contextCycle.receipt.input_count,1);
assert.equal(contextCycle.receipt.queue_count,1);


const radarRoot=fs.mkdtempSync(path.join(os.tmpdir(),'social-spectacle-radar-'));
const radarStateFile=path.join(radarRoot,'state.json');
fs.writeFileSync(radarStateFile,JSON.stringify({
  schema:'evercraft.systemia-radar.state.v1',
  observations:{},
  streams:{
    'puget-current':{
      subject_key:'puget-current',
      current:{
        signal_id:'radar:puget-current',
        observation_id:phenomenonObservation.observation_id,
        materiality_score:.92,
        publication_state:'eligible_for_editorial_selection',
        review:{status:'pass',freshness:{state:'fresh'}},
        provenance_refs:phenomenonObservation.provenance_refs,
        correlation_keys:phenomenonObservation.correlation_keys,
        observed_at:phenomenonObservation.observed_at,
        last_verified_at:'2026-09-30T23:09:00Z',
        observation:phenomenonObservation
      }
    }
  },
  receipts:[],
  last_edition:null
},null,2));
const radarFallbackCycle=runSpectacleCycle({
  radarStateFile,
  stateDir:path.join(radarRoot,'spectacle-state'),
  now:new Date('2026-09-30T23:10:00Z'),
});
assert.equal(radarFallbackCycle.receipt.input_count,1);
assert.equal(radarFallbackCycle.receipt.queue_count,1);


const quakeObservation={
  observation_id:'obs-usgs-quake-visual',
  source_system:'systemia-radar',
  source_family:'usgs-earthquake-hazards',
  observed_at:'2026-09-30T23:55:00Z',
  region_keys:['global'],
  domains:['geophysics','earth_hazards'],
  kind:'seismic_feed_state',
  evidence_state:'observed',
  reliability:.98,
  anomaly_score:.55,
  provenance_refs:['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'],
  correlation_keys:['usgs:m4.5-plus:past-day'],
  facts:{subject:'USGS M4.5+ earthquakes, past day',count:7,largest_magnitude:6.2,largest_place:'Example Region'},
  measurements:[
    {event_id:'q1',magnitude:6.2,place:'Example Region',lat:47.31,lon:-122.75,depth_km:18.4,observed_at:'2026-09-30T23:55:00Z'},
    {event_id:'q2',magnitude:5.4,place:'Second Region',lat:35.2,lon:140.1,depth_km:28.1,observed_at:'2026-09-30T22:45:00Z'},
    {event_id:'q3',magnitude:5.1,place:'Third Region',lat:-12.1,lon:166.8,depth_km:41.0,observed_at:'2026-09-30T21:10:00Z'}
  ]
};
const quakeCandidate=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle',priority:'normal'},
  observation:quakeObservation,
  recentSubjects:[],
  brandKey:'evercraft',
});
assert.equal(quakeCandidate.action,'candidate',JSON.stringify(quakeCandidate));
assert.equal(quakeCandidate.candidate.production.visual_path,'fallen_geo_explainer');
assert.ok(quakeCandidate.wonder_score>=.70);

const unvisualizedGlobal=assessSpectacleDispatch({
  dispatch:{consumer:'social_spectacle'},
  observation:{
    ...quakeObservation,
    observation_id:'space-alert-no-visual',
    domains:['space_weather'],
    kind:'space_weather_alert',
    anomaly_score:.9,
    facts:{subject:'Space weather alert',product_id:'ALTK05',lifecycle:'active',alert_fields:{level:'G3'}},
    measurements:[]
  },
});
assert.equal(unvisualizedGlobal.action,'background');
assert.equal(unvisualizedGlobal.reason,'no_visual_story_path');
