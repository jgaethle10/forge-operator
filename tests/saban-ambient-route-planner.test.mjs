import test from 'node:test';
import assert from 'node:assert/strict';
import { planAmbientRoute } from '../systemia/saban/ambient-route-planner.mjs';

const links=[
  {
    link_id:'chromebook-phone',
    from:'chromebook',
    to:'phone',
    protocol:'wifi',
    access_class:'authorized_compute',
    authorization_ref:'owner-home-fabric',
    attested:true,
    zero_cost:true,
    latency_ms:4,
    bandwidth_mbps:300,
    bidirectional:true,
  },
  {
    link_id:'phone-fridge',
    from:'phone',
    to:'fridge',
    protocol:'ble_proxy',
    access_class:'authorized_compute',
    authorization_ref:'owner-home-fabric',
    attested:true,
    zero_cost:true,
    latency_ms:18,
    bandwidth_mbps:2,
    bidirectional:true,
  },
  {
    link_id:'chromebook-hub',
    from:'chromebook',
    to:'hub',
    protocol:'ethernet',
    access_class:'authorized_compute',
    authorization_ref:'owner-home-fabric',
    attested:true,
    zero_cost:true,
    latency_ms:1,
    bandwidth_mbps:1000,
    bidirectional:true,
  },
  {
    link_id:'hub-fridge',
    from:'hub',
    to:'fridge',
    protocol:'matter',
    access_class:'authorized_compute',
    authorization_ref:'owner-home-fabric',
    attested:true,
    zero_cost:true,
    latency_ms:8,
    bandwidth_mbps:20,
    bidirectional:true,
  },
];

test('Saban can route to an authorized appliance through an intermediate device',()=>{
  const plan=planAmbientRoute({
    source:'chromebook',
    target:'fridge',
    links:links.slice(0,2),
    mode:'control',
    max_hops:3,
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.primary.hop_count,2);
  assert.deepEqual(plan.primary.hops.map(x=>x.from+'>'+x.to),[
    'chromebook>phone',
    'phone>fridge',
  ]);
  assert.equal(plan.primary.zero_cost,true);
  assert.equal(plan.credentials_embedded,false);
});

test('Saban can require an independent fallback path',()=>{
  const plan=planAmbientRoute({
    source:'chromebook',
    target:'fridge',
    links,
    mode:'control',
    require_fallback:true,
  });
  assert.equal(plan.state,'ready');
  assert.ok(plan.primary);
  assert.ok(plan.fallback);
  const primaryIds=new Set(plan.primary.hops.map(x=>x.link_id.replace(/:reverse$/,'')));
  assert.ok(plan.fallback.hops.every(x=>!primaryIds.has(x.link_id.replace(/:reverse$/,''))));
});

test('public/open observation is allowed only on read-only observation routes',()=>{
  const publicLink={
    link_id:'weather-sensor',
    from:'chromebook',
    to:'public-sensor',
    protocol:'http',
    access_class:'open_protocol',
    authorization_ref:null,
    read_only:true,
    attested:false,
    zero_cost:true,
    latency_ms:20,
    bandwidth_mbps:10,
  };
  const observe=planAmbientRoute({
    source:'chromebook',
    target:'public-sensor',
    links:[publicLink],
    mode:'observe',
  });
  assert.equal(observe.state,'ready');

  const control=planAmbientRoute({
    source:'chromebook',
    target:'public-sensor',
    links:[publicLink],
    mode:'control',
  });
  assert.equal(control.state,'held');
  assert.equal(control.primary,null);
});

test('bandwidth and attestation constraints hold routes instead of hand-waving',()=>{
  const bandwidth=planAmbientRoute({
    source:'chromebook',
    target:'fridge',
    links:links.slice(0,2),
    mode:'control',
    min_bandwidth_mbps:10,
  });
  assert.equal(bandwidth.state,'held');

  const unattested=[
    {...links[0],attested:false},
    links[1],
  ];
  const attested=planAmbientRoute({
    source:'chromebook',
    target:'fridge',
    links:unattested,
    mode:'control',
    require_attested:true,
  });
  assert.equal(attested.state,'held');
});

test('missing authorization on one hop breaks the entire control chain',()=>{
  const broken=[
    links[0],
    {...links[1],authorization_ref:null},
  ];
  const plan=planAmbientRoute({
    source:'chromebook',
    target:'fridge',
    links:broken,
    mode:'compute',
  });
  assert.equal(plan.state,'held');
  assert.equal(plan.primary,null);
});
