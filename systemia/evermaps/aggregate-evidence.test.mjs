import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WGS_EVIDENCE_LAYERS,wgsEvidenceQuery,ingestWgsEvidenceLayer,createWgsEvidencePacket
} from './aggregate-evidence.mjs';

const polygon={type:'Polygon',coordinates:[[[-120,46],[-120,46.1],[-119.9,46.1],[-120,46]]]};
const point={type:'Point',coordinates:[-120,46]};
const kinds={resources:'Demonstrated',tests:'Pass',mineHistory:'Inactive',studies:'Yakima'};
const one=(kind,id)=>({
  type:'Feature',geometry:['resources','studies'].includes(kind)?polygon:point,
  properties:{OBJECTID:id,COUNTY:'Yakima',
    CLASSIFICATION:kinds[kind],COMMODITY:'Sand and Gravel',RESULT:'Pass',
    MINE_DESCRIPTION:'Inactive',CITATION:'Example publication'}
});
function fakeWgs(counts,options={}) {
  const calls=[],sampled=Object.fromEntries(Object.keys(WGS_EVIDENCE_LAYERS).map(k=>[k,0]));
  const fetchImpl=async(url)=>{
    const parsed=new URL(url);
    const kind=Object.keys(WGS_EVIDENCE_LAYERS).find(k=>parsed.pathname.endsWith('/'+WGS_EVIDENCE_LAYERS[k].id+'/query'));
    assert.ok(kind,'Known service layer');
    const countOnly=parsed.searchParams.has('returnCountOnly');
    calls.push({kind,countOnly,offset:Number(parsed.searchParams.get('resultOffset')??0)});
    if (countOnly) {
      sampled[kind]++;
      return {ok:true,json:async()=>({count:options.drift===kind&&sampled[kind]===2?counts[kind]+1:counts[kind]})};
    }
    const offset=Number(parsed.searchParams.get('resultOffset')??0);
    const pageSize=Number(parsed.searchParams.get('resultRecordCount'));
    const remaining=Math.max(0,counts[kind]-offset);
    const features=Array.from({length:Math.min(pageSize,remaining)},(_,i)=>one(kind,
      options.duplicate&&offset>0?1:offset+i+1));
    return {ok:true,json:async()=>({type:'FeatureCollection',features})};
  };
  return {calls,fetchImpl};
}
test('queries enforce WGS schema and county sanitization',()=>{
  for (const kind of Object.keys(WGS_EVIDENCE_LAYERS)) {
    const url=new URL(wgsEvidenceQuery({kind,county:'Yakima',pageSize:200,offset:0}));
    assert.match(url.pathname,new RegExp('/'+WGS_EVIDENCE_LAYERS[kind].id+'/query$'));
    assert.equal(url.searchParams.get('outSR'),'4326');
    assert.equal(url.searchParams.get('f'),'geojson');
    assert.ok(url.searchParams.get('outFields').split(',').includes('OBJECTID'));
    const count=new URL(wgsEvidenceQuery({kind,countOnly:true}));
    assert.equal(count.searchParams.get('returnCountOnly'),'true');
    assert.equal(count.searchParams.get('f'),'json');
  }
  assert.throws(()=>wgsEvidenceQuery({kind:'resources',county:"Yakima' OR 1=1"}));
  assert.throws(()=>wgsEvidenceQuery({kind:'bogus'}));
});
test('source count, pagination and second-count reconciliation',async()=>{
  const {calls,fetchImpl}=fakeWgs({resources:3,tests:0,mineHistory:0,studies:0});
  const layer=await ingestWgsEvidenceLayer({kind:'resources',fetchImpl,pageSize:2,now:()=> 'fixed'});
  assert.equal(layer.metadata.complete,true);
  assert.equal(layer.metadata.fetched_features,3);
  assert.equal(layer.metadata.count_before,3);
  assert.equal(layer.metadata.count_after,3);
  assert.equal(layer.metadata.pages_fetched,2);
  assert.deepEqual(calls.map(c=>c.countOnly),[true,false,false,true]);
});
test('truncated coverage stays explicit',async()=>{
  const {fetchImpl}=fakeWgs({resources:4});
  const layer=await ingestWgsEvidenceLayer({kind:'resources',fetchImpl,pageSize:2,maxPages:1});
  assert.equal(layer.metadata.complete,false);
  assert.match(layer.metadata.warning,/INCOMPLETE SOURCE/);
});
test('count drift and repeated identifiers fail closed',async()=>{
  const shifted=fakeWgs({resources:1},{drift:'resources'});
  await assert.rejects(ingestWgsEvidenceLayer({kind:'resources',fetchImpl:shifted.fetchImpl}),/count changed/);
  const repeat=fakeWgs({resources:3},{duplicate:true});
  await assert.rejects(ingestWgsEvidenceLayer({kind:'resources',fetchImpl:repeat.fetchImpl,pageSize:2}),/Repeated OBJECTID/);
});
test('packet keeps test, mine history and study area independent',async()=>{
  const {fetchImpl}=fakeWgs({resources:2,tests:1,mineHistory:1,studies:1});
  const packet=await createWgsEvidencePacket({fetchImpl,pageSize:1});
  assert.equal(packet.status,'evidence_for_human_review');
  assert.equal(packet.mapped_research_queue.features.length,2);
  assert.equal(packet.reference_layers.materialTests.features[0].properties.RESULT,'Pass');
  assert.equal(packet.reference_layers.historicalMineSites.features[0].properties.MINE_DESCRIPTION,'Inactive');
  assert.equal(packet.summary.study_coverage_verified,false);
  assert.match(packet.caveats.join(' '),/NOT proof/);
  assert.equal(packet.summary.source_layer_counts.tests.count_after,1);
});
test('missing study features cannot unlock review state',async()=>{
  const {fetchImpl}=fakeWgs({resources:1,tests:0,mineHistory:0,studies:0});
  const packet=await createWgsEvidencePacket({fetchImpl,pageSize:1});
  assert.equal(packet.status,'coverage_review_required');
});
