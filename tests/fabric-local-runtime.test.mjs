import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  nativeOnlyCatalog,
  startFabricLocalRuntime,
} from '../systemia/mcp/fabric-local-runtime.mjs';

const catalog=[
  {
    public_id:'native-product-v1',
    name:'Native Product',
    description:'A native Evercraft capability.',
    keywords:['native'],
    state:'payment_ready',
    commercial_state:'sell_now',
    pricing:'Quick start $49 one-time.',
    use_when:['I need a native capability right now','route this problem to Native Product'],
    entry_paid_offer:{name:'Quick start',price:'$49',billing:'one_time',price_usd_normalized:49},
    connections:[
      {type:'mcp',label:'legacy universal',url:'https://legacy.base44.app/functions/mcp'},
      {type:'mcp',label:'owned direct',url:'https://fabric.evercraft.example/mcp/native'},
      {type:'website',label:'legacy website',url:'https://product.base44.app/view'},
      {type:'website',label:'owned website',url:'https://example.com/'},
    ],
  },
];

test('native-only bridge removes every Base44 handoff while keeping owned/public-safe routes',()=>{
  const prepared=nativeOnlyCatalog(catalog);
  assert.equal(prepared.removed_legacy_base44_connections,2);
  assert.equal(prepared.removed_legacy_base44_mcp_connections,1);
  const connections=prepared.capabilities[0].connections;
  assert.equal(connections.some((x)=>/base44\.app/.test(x.url)),false);
  assert.equal(connections.some((x)=>x.url==='https://fabric.evercraft.example/mcp/native'),true);
  assert.equal(connections.some((x)=>x.type==='website'&&x.url==='https://example.com/'),true);
});

test('Fabric health exposes only redacted Saban Resource Field residency and fails stale receipts closed',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-saban-health-'));
  const healthFile=path.join(root,'saban-capacity-health.json');
  const write=(observed_at)=>fs.writeFileSync(healthFile,JSON.stringify({
    schema:'evercraft.fabric-saban-capacity-health.v1',
    resident:true,
    state:'ready',
    owned_host:true,
    zero_spend_only:true,
    public_market_discovery:false,
    observed_at,
    private_node_id:'must-not-leak',
    allocator_token:'must-not-leak',
  }));

  write(new Date().toISOString());
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    sabanCapacityHealthFile:healthFile,
  });
  try{
    let health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.saban_resource_field_resident,true);
    assert.equal(health.saban_resource_field_state,'ready');
    assert.equal(health.saban_resource_field_zero_spend_only,true);
    assert.equal(health.saban_resource_field_public_market_discovery,false);
    assert.equal(health.saban_resource_field_receipt_stale,false);
    assert.ok(health.saban_resource_field_observed_at);
    assert.equal('private_node_id' in health,false);
    assert.equal('allocator_token' in health,false);

    write('2000-01-01T00:00:00Z');
    health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.saban_resource_field_resident,false);
    assert.equal(health.saban_resource_field_state,'ready');
    assert.equal(health.saban_resource_field_receipt_stale,true);
  }finally{
    await runtime.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Fabric health binds the source release once at process boot',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-release-ref-'));
  const releaseFile=path.join(root,'runtime-release-ref');
  const first='1111111111111111111111111111111111111111';
  const second='2222222222222222222222222222222222222222';
  fs.writeFileSync(releaseFile,first+'\n');

  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    releaseRefFile:releaseFile,
  });
  try{
    let health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.source_release_ref,first);
    assert.equal(health.source_release_ref_bound,true);

    fs.writeFileSync(releaseFile,second+'\n');
    health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(
      health.source_release_ref,
      first,
      'disk marker changes must not masquerade as a resident process restart'
    );
  }finally{
    await runtime.close();
  }

  const restarted=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    releaseRefFile:releaseFile,
  });
  try{
    const health=await fetch(restarted.url+'/health').then((r)=>r.json());
    assert.equal(health.source_release_ref,second);
    assert.equal(health.source_release_ref_bound,true);
  }finally{
    await restarted.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Fabric local runtime is read-only, tunnel-compatible, and makes no Base44 transport available',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try {
    const health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.base44_transport_enabled,false);
    assert.equal(health.secure_tunnel_compatible,true);
    assert.equal(health.public_plugin_submission_ready,true);
    assert.equal(health.provider_publication_state,'external_to_runtime');
    assert.equal(health.chum_human_review_path_template,'/api/chum/go/{public_id}');
    assert.equal(health.chum_human_review_authority,'discovery_review_only');
    assert.equal(health.removed_legacy_base44_connections,2);
    assert.equal(health.removed_legacy_base44_mcp_connections,1);
    assert.equal(health.visual_desk_path,'/visuals/');
    assert.equal(health.visual_desk_ready,true);
    assert.ok(health.visual_desk_story_count>=1);
    assert.equal(health.visual_desk_motion_capable,true);
    assert.deepEqual(health.transport_modes,['application/json','text/event-stream']);

    const sseProbe=await fetch(runtime.mcpUrl,{
      headers:{accept:'text/event-stream'},
    });
    assert.equal(sseProbe.status,200);
    assert.match(sseProbe.headers.get('content-type')||'',/^text\/event-stream/);
    assert.equal(sseProbe.headers.get('mcp-protocol-version'),'2025-03-26');
    assert.match(await sseProbe.text(),/^event: message\ndata: \{/);

    const initResponse=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'secure-tunnel-test',version:'1'}},
      }),
    });
    assert.equal(initResponse.status,200);
    assert.match(initResponse.headers.get('content-type')||'',/^text\/event-stream/);
    assert.ok(initResponse.headers.get('mcp-session-id'));
    assert.equal(initResponse.headers.get('mcp-protocol-version'),'2025-03-26');
    const initEvent=await initResponse.text();
    assert.match(initEvent,/^event: message\ndata: /);
    const init=JSON.parse(initEvent.split('data: ')[1].trim());
    assert.equal(init.result.serverInfo.name,'evercraft-fabric');

    const tools=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),
    }).then((r)=>r.json());
    assert.deepEqual(tools.result.tools.map((x)=>x.name),[
      'match_evercraft_capability',
      'list_evercraft_capabilities',
      'get_evercraft_connection_options',
    ]);
    assert.ok(tools.result.tools.every((x)=>x.annotations.readOnlyHint===true));

    const options=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:3,method:'tools/call',
        params:{name:'get_evercraft_connection_options',arguments:{public_id:'native-product-v1'}},
      }),
    }).then((r)=>r.json());
    const body=options.result.structuredContent;
    assert.equal(body.external_action_taken,false);
    assert.equal(body.connections.some((x)=>/base44\.app/.test(x.url)),false);
  } finally {
    await runtime.close();
  }
});


test('Fabric public customer front door is branded, browsable, and policy-safe',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try {
    const homeResponse=await fetch(runtime.url+'/');
    assert.equal(homeResponse.status,200);
    assert.match(homeResponse.headers.get('content-type')||'',/^text\/html/);
    assert.equal(homeResponse.headers.get('x-frame-options'),'DENY');
    const home=await homeResponse.text();
    assert.match(home,/Bring the problem/);
    assert.match(home,/Explore 1 capabilities/);
    assert.match(home,/No silent checkout/);
    assert.match(home,/Available now/);
    assert.match(home,/Quick start \$49 one-time/);
    assert.match(home,/\/capabilities\/native-product-v1/);
    assert.match(home,/\/assets\/evercraft-icon\.png/);

    // Social and ChatGPT link previews append tracking queries to public URLs.
    // They must not turn a valid landing page into a 404.
    for(const suffix of ['?utm_source=chatgpt.com','?utm_source=discord&utm_medium=dm','?x=1']){
      const trackedHome=await fetch(runtime.url+'/'+suffix);
      assert.equal(trackedHome.status,200,'homepage with tracking: '+suffix);
      assert.match(trackedHome.headers.get('content-type')||'',/^text\/html/);
      assert.match(await trackedHome.text(),/Bring the problem/);
    }
    const trackedOffers=await fetch(runtime.url+'/offers?utm_source=chatgpt.com');
    assert.equal(trackedOffers.status,200);
    assert.match(trackedOffers.headers.get('content-type')||'',/^text\/html/);


    const directoryResponse=await fetch(runtime.url+'/capabilities');
    assert.equal(directoryResponse.status,200);
    const directory=await directoryResponse.text();
    assert.match(directory,/Native Product/);
    assert.match(directory,/sell_now/);
    assert.match(directory,/Quick start \$49 one-time/);
    assert.match(directory,/\/capabilities\/native-product-v1/);
    assert.equal(directory.includes('base44.app'),false);

    const detailResponse=await fetch(runtime.url+'/capabilities/native-product-v1');
    assert.equal(detailResponse.status,200);
    const detail=await detailResponse.text();
    assert.match(detail,/Native Product/);
    assert.match(detail,/Quick start \$49 one-time/);
    assert.match(detail,/I need a native capability right now/);
    assert.equal(detail.includes('base44.app'),false);

    const reviewResponse=await fetch(runtime.url+'/api/chum/go/native-product-v1?surface=test-suite',{
      redirect:'manual',
    });
    assert.equal(reviewResponse.status,302);
    assert.equal(
      reviewResponse.headers.get('location'),
      '/capabilities/native-product-v1?from=chum&surface=test-suite'
    );
    assert.equal(reviewResponse.headers.get('x-evercraft-authority'),'discovery-review-only');

    const badReview=await fetch(runtime.url+'/api/chum/go/not-a-real-capability',{redirect:'manual'});
    assert.equal(badReview.status,404);
    const badReviewBody=await badReview.json();
    assert.equal(badReviewBody.external_action_taken,false);

    const capabilityJson=await fetch(runtime.url+'/capabilities/native-product-v1.json').then((r)=>r.json());
    assert.equal(capabilityJson.ok,true);
    assert.equal(capabilityJson.capability.public_id,'native-product-v1');
    assert.equal(capabilityJson.capability.commercial_state,'sell_now');
    assert.equal(capabilityJson.capability.entry_paid_offer.price,'$49');
    assert.equal(capabilityJson.transactional,false);

    const directoryJson=await fetch(runtime.url+'/capabilities.json').then((r)=>r.json());
    assert.equal(directoryJson.returned,1);
    assert.equal(directoryJson.capabilities[0].pricing,'Quick start $49 one-time.');

    const iconResponse=await fetch(runtime.url+'/assets/evercraft-icon.png');
    assert.equal(iconResponse.status,200);
    assert.equal(iconResponse.headers.get('content-type'),'image/png');
    assert.ok((await iconResponse.arrayBuffer()).byteLength>1000);

    const listingPages=[
      ['support',/Evercraft Fabric Support/],
      ['privacy',/Evercraft Fabric Privacy Policy/],
      ['terms',/Evercraft Fabric Terms of Service/],
    ];
    for(const [page,pattern] of listingPages){
      const response=await fetch(runtime.url+'/'+page);
      assert.equal(response.status,200);
      assert.match(response.headers.get('content-type')||'',/^text\/html/);
      assert.match(await response.text(),pattern);
    }

    const journalReady=runtime.health().journal_mirror_ready===true;
    assert.equal(runtime.health().journal_mirror_indexing,'index_follow_canonical_public_origin');
    const journalResponse=await fetch(runtime.url+'/journal/');
    if(journalReady){
      assert.equal(journalResponse.status,200);
      assert.match(journalResponse.headers.get('content-type')||'',/^text\/html/);
      assert.equal(journalResponse.headers.get('x-robots-tag'),'index, follow');
      const journal=await journalResponse.text();
      assert.match(journal,/Evercraft Journal/);
      assert.doesNotMatch(journal,/Black Friday|shopping assistant|optimize your cart/i);
    }else{
      assert.equal(journalResponse.status,404);
      const held=await journalResponse.json();
      assert.equal(held.error,'journal_asset_not_found');
    }

    const visualIndexResponse=await fetch(runtime.url+'/visuals/');
    assert.equal(visualIndexResponse.status,200);
    assert.match(visualIndexResponse.headers.get('content-type')||'',/^text\/html/);
    assert.equal(visualIndexResponse.headers.get('x-robots-tag'),'index, follow');
    assert.match(await visualIndexResponse.text(),/Evercraft Visual Desk/);

    const volcanoResponse=await fetch(runtime.url+'/visuals/washington-active-volcanoes/');
    assert.equal(volcanoResponse.status,200);
    assert.match(volcanoResponse.headers.get('content-type')||'',/^text\/html/);
    const volcano=await volcanoResponse.text();
    assert.match(volcano,/Washington/);
    assert.match(volcano,/poster-feed\.svg/);
    assert.match(volcano,/usgs\.gov/);

    const storyCardResponse=await fetch(runtime.url+'/visuals/washington-active-volcanoes/card-story.svg');
    assert.equal(storyCardResponse.status,200);
    assert.equal(storyCardResponse.headers.get('content-type'),'image/svg+xml');
    assert.match(await storyCardResponse.text(),/height="1920"/);

    const motionResponse=await fetch(runtime.url+'/visuals/washington-active-volcanoes/motion.html');
    assert.equal(motionResponse.status,200);
    assert.match(motionResponse.headers.get('content-security-policy')||'',/script-src 'unsafe-inline'/);
    const motion=await motionResponse.text();
    assert.match(motion,/__evercraftRenderAt/);
    assert.match(motion,/__evercraftRenderFrame/);

    const visualCatalogResponse=await fetch(runtime.url+'/visuals/index.json');
    assert.equal(visualCatalogResponse.status,200);
    const visualCatalog=await visualCatalogResponse.json();
    assert.equal(visualCatalog.schema,'evercraft.fabric.visual-desk-index.v1');
    assert.ok(visualCatalog.count>=1);
    assert.ok(visualCatalog.stories.some((story)=>story.slug==='washington-active-volcanoes'));
  } finally {
    await runtime.close();
  }
});
