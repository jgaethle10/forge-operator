import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialRelationPost,studyQueryUrl,verifyPublisherStudyJoins} from './wgs-study-spatial-join.mjs';

const nativeStudy={
  rings:[[[-119.6,46.5],[-119.2,46.5],[-119.2,46.9],[-119.6,46.9],[-119.6,46.5]]]
};
function mockPublisher({unknown=false,withinOutside=false}={}) {
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url.includes('/12/query?'))return {ok:true,json:async()=>({
      features:[{attributes:{OBJECTID:7},geometry:nativeStudy}]
    })};
    if(!url.endsWith('/11/query')) throw new Error('Unexpected source path');
    const payload=new URLSearchParams(init.body);
    const relation=payload.get('spatialRel');
    const objectIds=relation==='esriSpatialRelIntersects'?[1,2,unknown?99:3]:
      withinOutside?[1,4]:[1,2];
    return {ok:true,json:async()=>({objectIdFieldName:'OBJECTID',objectIds})};
  };
  return {calls,fetchImpl};
}
test('study request preserves publisher geometry and safe parameters',()=>{
  const url=new URL(studyQueryUrl('Grant'));
  assert.equal(url.searchParams.get('outSR'),'4326');
  assert.equal(url.searchParams.get('returnGeometry'),'true');
  assert.throws(()=>studyQueryUrl("Grant' OR 1=1"),/Invalid county/);
  const post=spatialRelationPost({county:'Grant',geometry:nativeStudy,relation:'esriSpatialRelIntersects'});
  assert.equal(post.method,'POST');
  const form=new URLSearchParams(post.body);
  assert.equal(form.get('returnIdsOnly'),'true');
  assert.deepEqual(JSON.parse(form.get('geometry')).rings,nativeStudy.rings);
  assert.throws(()=>spatialRelationPost({geometry:nativeStudy,relation:'deleteAll'}));
});
test('authoritative server intersects/within sets are validated separately',async()=>{
  const mock=mockPublisher();
  const result=await verifyPublisherStudyJoins({county:'Grant',sourceIds:[1,2,3,4],fetchImpl:mock.fetchImpl});
  assert.equal(result.polygon_intersects_study_count,3);
  assert.equal(result.polygon_within_study_count,2);
  assert.equal(result.polygon_does_not_intersect_study_count,1);
  assert.deepEqual(result.study_ids,[7]);
  assert.match(result.method,/ArcGIS server/);
  assert.equal(mock.calls.length,3);
});
test('source mismatch and inconsistent server geometry relations fail closed',async()=>{
  await assert.rejects(verifyPublisherStudyJoins({
    sourceIds:[1,2,3,4],fetchImpl:mockPublisher({unknown:true}).fetchImpl
  }),/non-imported/);
  await assert.rejects(verifyPublisherStudyJoins({
    sourceIds:[1,2,3,4],fetchImpl:mockPublisher({withinOutside:true}).fetchImpl
  }),/subset/);
  await assert.rejects(verifyPublisherStudyJoins({sourceIds:[1,1]}),/unique/);
});
