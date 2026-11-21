import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WGS_RESOURCE_LAYER,buildAggregateQuery,fetchAggregateResources,
  queueToGeoJSON,screenAggregateResources
} from './mineral-intelligence.mjs';

const geo={type:'Polygon',coordinates:[[[-120,46],[-120,46.1],[-119.9,46.1],[-120,46]]]};
const feature=(id,classification,geometry=geo)=>({
  type:'Feature',id,geometry,
  properties:{
    OBJECTID:id,RESOURCE_ID:'WA-'+id,CLASSIFICATION:classification,
    COMMODITY:'Sand and Gravel',COUNTY:'Yakima',RESOURCE_ACREAGE:12.5
  }
});

test('query preserves canonical source and safe parameters',()=>{
  const u=new URL(buildAggregateQuery({county:'Yakima',pageSize:2,offset:2}));
  assert.equal(u.origin+u.pathname,WGS_RESOURCE_LAYER+'/query');
  assert.equal(u.searchParams.get('where'),"COUNTY='Yakima'");
  assert.equal(u.searchParams.get('outSR'),'4326');
  assert.equal(u.searchParams.get('resultOffset'),'2');
  assert.throws(()=>buildAggregateQuery({county:"X' OR 1=1"}));
  assert.throws(()=>buildAggregateQuery({pageSize:2001}));
});

test('pagination, provenance, review-queue ordering',async()=>{
  const calls=[];
  const data=await fetchAggregateResources({
    pageSize:2,now:()=> '2026-10-27T00:00:00Z',
    fetchImpl:async(url)=>{
      calls.push(new URL(url).searchParams.get('resultOffset'));
      return {ok:true,json:async()=>({
        type:'FeatureCollection',
        features:calls.length===1?[feature(1,'Inferred'),feature(2,'Demonstrated')]:[]
      })};
    }
  });
  assert.deepEqual(calls,['0','2']);
  assert.equal(data.metadata.complete,true);
  const screen=screenAggregateResources(data);
  assert.deepEqual(screen.research_queue.map(f=>f.classification),['Demonstrated','Inferred']);
  assert.equal(queueToGeoJSON(screen).features.length,2);
  assert.equal(screen.research_queue[0].evidence.drilled_resource,null);
  assert.ok(screen.research_queue[0].unresolved.includes('property ownership and mineral rights'));
});

test('unknown, not-resource and missing geometry are never asserted as targets',async()=>{
  const screen=screenAggregateResources({
    type:'FeatureCollection',features:[
      feature(1,'Not a Resource'),feature(2,'Not Analyzed'),
      feature(3,'Speculative',null),feature(4,null),feature(5,'Demonstrated')
    ]
  });
  assert.equal(screen.counts.review_queue,1);
  assert.equal(screen.counts.excluded_not_a_resource,1);
  assert.equal(screen.counts.unknown_or_not_analyzed,2);
  assert.equal(screen.counts.no_geometry,1);
  const truncated=await fetchAggregateResources({
    maxPages:1,pageSize:1,
    fetchImpl:async()=>({ok:true,json:async()=>({type:'FeatureCollection',features:[feature(5,'Demonstrated')]})})
  });
  assert.equal(truncated.metadata.complete,false);
  assert.match(truncated.metadata.warning,/truncated/);
});

test('upstream failures fail closed',async()=>{
  await assert.rejects(fetchAggregateResources({fetchImpl:async()=>({ok:false,status:503})}),/503/);
  await assert.rejects(fetchAggregateResources({
    fetchImpl:async()=>({ok:true,json:async()=>({error:{message:'oops'}})})
  }),/oops/);
  await assert.rejects(fetchAggregateResources({
    fetchImpl:async()=>({ok:true,json:async()=>({features:[]})})
  }),/unexpected/);
});
