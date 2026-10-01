import assert from 'node:assert/strict';
import {
  assessSpectacleEditorialPreflight,
  captionFromCandidate,
  phenomenonInputFromCandidate,
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
assert.equal(editorial.status,'accepted');
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
