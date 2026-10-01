import assert from 'node:assert/strict';
import {
  assessSpectacleEditorialPreflight,
  captionFromCandidate,
  phenomenonInputFromCandidate,
  worldIntelInputFromCandidate,
} from './social-spectacle-production.mjs';

const candidate={
  schema:'evercraft.social-spectacle.candidate.v1',
  candidate_id:'spectacle:puget-proof',
  brand_key:'evercraft',
  title_seed:'Surface currents accelerate through a narrow inland passage',
  domains:['ocean','water'],
  region_keys:['puget-sound'],
  evidence_state:'modeled',
  evidence_label:'MODELED',
  source_family:'NOAA operational forecast model',
  source_refs:['noaa:sscofs:proof'],
  production:{
    visual_path:'fallen_phenomenon',
    no_text_card_first:true,
    phenomenon:{
      kind:'flow',
      title:'A Week of Currents',
      subtitle:'Puget Sound surface movement',
      callout:'A narrow passage accelerates exchange between basins.',
      durationSec:18,
      geography:{
        bounds:{north:48.5,south:46.9,west:-123.5,east:-121.8},
        labels:[{label:'Seattle',lat:47.61,lon:-122.33}]
      },
      encoding:{
        motionLabel:'surface-current direction',
        color:{label:'water temperature',min:51,max:61,unit:'°F'},
        brightness:{label:'current speed',min:0,max:5,unit:'kt'}
      },
      streamlines:[{
        id:'narrows',
        points:[
          {lat:47.45,lon:-122.65,colorValue:57,magnitude:2.1},
          {lat:47.34,lon:-122.58,colorValue:58,magnitude:4.8},
          {lat:47.20,lon:-122.53,colorValue:59,magnitude:3.3}
        ]
      }]
    }
  }
};

const vertical=phenomenonInputFromCandidate(candidate,{aspectRatio:'9:16'});
assert.equal(vertical.aspectRatio,'9:16');
assert.equal(vertical.field.evidenceState,'modeled');
assert.deepEqual(vertical.field.sourceRefs,['noaa:sscofs:proof']);
assert.deepEqual(vertical.field.streamlines[0].sourceRefs,['noaa:sscofs:proof']);

const wide=phenomenonInputFromCandidate(candidate,{aspectRatio:'16:9'});
assert.equal(wide.aspectRatio,'16:9');

const caption=captionFromCandidate(candidate);
assert.ok(caption.length>=320);
assert.equal(caption.split(/\n\s*\n/).length,2);
assert.match(caption,/modeled data/i);
assert.match(caption,/Source: NOAA/i);

const editorial=assessSpectacleEditorialPreflight({
  candidate,
  caption,
  masterQc:{status:'accepted'}
});
assert.equal(editorial.status,'accepted',JSON.stringify(editorial));
assert.equal(editorial.score,10);
assert.equal(editorial.publication_authority,false);

const bad=structuredClone(candidate);
bad.brand_key='rnb-chicken-and-soul';
const held=assessSpectacleEditorialPreflight({candidate:bad,caption,masterQc:{status:'accepted'}});
assert.equal(held.status,'rejected');
assert.ok(held.failures.includes('brand_and_destination_policy'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.social-spectacle.production-proof.v1',
  vertical_and_landscape:true,
  modeled_state_preserved:true,
  substantive_caption:true,
  editorial_preflight_10_of_10:true,
  blocked_brand_preserved:true,
  publication_authority:false,
},null,2));


const geoCandidate={
  ...candidate,
  candidate_id:'spectacle:earthquake-proof',
  title_seed:'USGS M4.5+ past-day feed contains 7 events; largest is M6.2 Example Region.',
  domains:['geophysics','earth_hazards'],
  region_keys:['global'],
  evidence_state:'observed',
  evidence_label:'OBSERVED',
  source_family:'USGS Earthquake Hazards',
  source_refs:['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'],
  production:{
    visual_path:'fallen_geo_explainer',
    no_text_card_first:true,
    data_payload:{
      facts:{
        subject:'USGS M4.5+ earthquakes, past day',
        count:7,
        largest_magnitude:6.2,
        largest_place:'Example Region'
      },
      measurements:[
        {event_id:'q1',magnitude:6.2,place:'Example Region',lat:47.31,lon:-122.75,depth_km:18.4,observed_at:'2026-09-30T23:55:00Z'},
        {event_id:'q2',magnitude:5.4,place:'Second Region',lat:35.2,lon:140.1,depth_km:28.1,observed_at:'2026-09-30T22:45:00Z'},
        {event_id:'q3',magnitude:5.1,place:'Third Region',lat:-12.1,lon:166.8,depth_km:41.0,observed_at:'2026-09-30T21:10:00Z'}
      ]
    }
  }
};
const geoVertical=worldIntelInputFromCandidate(geoCandidate,{aspectRatio:'9:16'});
assert.equal(geoVertical.aspectRatio,'9:16');
assert.equal(geoVertical.map.points.length,3);
assert.equal(geoVertical.metrics[0].value,7);
assert.equal(geoVertical.metrics[1].value,6.2);
assert.equal(geoVertical.timeline.events.length,3);
const geoCaption=captionFromCandidate(geoCandidate);
assert.match(geoCaption,/maps the recorded events/i);
const geoEditorial=assessSpectacleEditorialPreflight({
  candidate:geoCandidate,
  caption:geoCaption,
  masterQc:{status:'accepted'}
});
assert.equal(geoEditorial.status,'accepted',JSON.stringify(geoEditorial));
assert.equal(geoEditorial.score,10);
