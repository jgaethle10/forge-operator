import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource,assertRoster,assertPublicReleaseDenied,compileReview} from '../scripts/brand/compile-review-wall.mjs';

function snapshot(){
  const s=loadSource();
  return structuredClone(s);
}

test('internal brand review renders with real source-bound marks and plain informational statuses',()=>{
  const {workstreams,identity}=snapshot();
  assert.equal(assertRoster(workstreams,identity),true);
  const html=compileReview(workstreams,identity);
  assert.match(html,/INTERNAL BRAND REVIEW/);
  assert.match(html,/Evercraft Network/);
  assert.match(html,/Evercraft Research/);
  assert.match(html,/VERIFIED ORIGINAL MARK/);
  assert.match(html,/EVERCRAFT TEXT FALLBACK/);
  assert.doesNotMatch(html,/missed favorites|inquiry|color-coded warnings/i);
  assert.doesNotMatch(html,/SkyOps|AliEV|RIVET/);
});

test('restricted or partner-linked projects cannot enter review roster',()=>{
  for(const name of ['SkyOps Parking','RIVET','AliEV','sky-ops tower']){
    const {workstreams,identity}=snapshot();
    workstreams.workstreams.push({
      key:'test-restricted-'+name.toLowerCase().replace(/ /g,'-'),name,kind:'product',
      description:'Unapproved partner-linked project',priority:'now',
      approval:'unreviewed',release_stage:'not_attested'
    });
    assert.throws(()=>assertRoster(workstreams,identity),/Restricted project/);
  }
});

test('duplicated logos are rejected, not treated as independent brand identities',()=>{
  const {workstreams,identity}=snapshot();
  const parent=identity.brands.find(x=>x.key==='evercraft-network');
  parent.asset={status:'verified_existing_mark',source:'public/research/assets/research-mark.svg'};
  assert.throws(()=>assertRoster(workstreams,identity),/multiple products/);
});

test('unverified artwork must never be assigned to another product',()=>{
  const {workstreams,identity}=snapshot();
  identity.brands.find(x=>x.key==='forensiscope').asset.source='public/mesh/ai-boardroom/crest.svg';
  assert.throws(()=>assertRoster(workstreams,identity),/Unverified brand has logo source/);
});

test('public publishing is fail-closed without separate rights and editorial release',()=>{
  const {workstreams,identity}=snapshot();
  assert.throws(()=>assertPublicReleaseDenied('public',workstreams,identity),/Public compilation is disabled/);
  assert.doesNotThrow(()=>assertPublicReleaseDenied('review',workstreams,identity));
  workstreams.publication_approved=true;
  assert.throws(()=>assertRoster(workstreams,identity),/must not authorize publication/);
});

test('manifest cannot assert customer product release or approval on a review row',()=>{
  const {workstreams,identity}=snapshot();
  workstreams.workstreams[0].approval='approved';
  assert.throws(()=>assertRoster(workstreams,identity),/must remain explicitly unapproved/);
});
