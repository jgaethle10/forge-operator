import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeFabricDirectoryRpc,
  fabricDirectoryTools,
  loadFabricCatalogFromRepository,
  matchFabricCapabilities,
  normalizeFabricCatalog,
  validateOpenAiChallengeToken,
} from '../systemia/mcp/fabric-directory.mjs';
import { startSpecialistHandoffRuntime } from '../systemia/mcp/specialist-handoff-runtime.mjs';

const catalog=[
  {
    public_id:'findmypart-paid-hunt-v1',
    name:'FindMyPart',
    description:'Find hard-to-find, obsolete, discontinued, cross-reference, salvage, blueprint, fabrication, and functionally equivalent parts.',
    keywords:['obsolete part','cross reference','hard to find part','discontinued part'],
    state:'available',
    connections:[
      {type:'website',label:'FindMyPart',url:'https://findmypart.base44.app/'},
    ],
  },
  {
    public_id:'aliev-site-opportunity-snapshot-v1',
    name:'AliEV / RIVET EV Site Opportunity',
    description:'Evaluate an address for EV charging opportunity, competition, traffic, power, tariffs, incentives, and site economics.',
    keywords:['ev charging','charger site','electric vehicle infrastructure'],
    state:'available',
    connections:[],
  },
];

test('Fabric boots from the canonical CHUM capability index without a manual routing table',()=>{
  const canonical=loadFabricCatalogFromRepository();
  assert.ok(canonical.length>=40);
  assert.ok(canonical.some((x)=>x.public_id==='findmypart-paid-hunt-v1'));
  const aliev=canonical.find((x)=>x.public_id==='aliev-site-opportunity-snapshot-v1');
  assert.ok(aliev);
  assert.ok(!aliev.connections.some((x)=>x.type==='mcp'&&/alievMcp/.test(x.url)));
  assert.ok(aliev.connections.some((x)=>x.type==='mcp'&&x.url==='https://fabric.systemiacommandcenters.com/mcp'));
  assert.ok(aliev.connections.some((x)=>x.type==='docs'));
  assert.equal(aliev.start_url_state,'held_no_owned_public_origin');
  assert.equal(aliev.preferred_agent_route,'universal_fallback');
  assert.ok(canonical.every((x)=>x.connections.some((connection)=>connection.type==='mcp')));
  const findMyPart=canonical.find((x)=>x.public_id==='findmypart-paid-hunt-v1');
  assert.ok(findMyPart.connections.some((x)=>x.type==='mcp'&&x.url==='https://fabric.systemiacommandcenters.com/mcp'));
});

test('portfolio registry broadens Fabric beyond brand-known CHUM capabilities without leaking legacy specialist transports',()=>{
  const canonical=loadFabricCatalogFromRepository();
  const daytrade=canonical.find((x)=>x.public_id==='product:daytrade-lens');
  assert.ok(daytrade,'DayTrade Lens product-level problem route must be visible');
  assert.ok(daytrade.keywords.some((x)=>/paper trade|trading risk|trading journal/i.test(x)));

  const fallen=canonical.find((x)=>x.public_id==='media:fallen');
  assert.ok(fallen,'Fallen / Studio must be problem-discoverable from the portfolio registry');
  assert.ok(fallen.keywords.some((x)=>/documentary|cinematic|visual explanation/i.test(x)));

  const alievProduct=canonical.find((x)=>x.public_id==='product:aliev');
  assert.ok(alievProduct);
  assert.ok(alievProduct.connections.some((x)=>x.type==='mcp'&&x.url==='https://fabric.systemiacommandcenters.com/mcp'));
  assert.ok(!alievProduct.connections.some((x)=>/base44\.app/.test(x.url)),'legacy specialist transport must not be reintroduced through portfolio discovery');
});

test('Fabric catalog normalizes and intent matching finds the problem-native capability',()=>{
  const normalized=normalizeFabricCatalog(catalog);
  assert.equal(normalized.length,2);
  const hits=matchFabricCapabilities(
    'I need a cross reference for an obsolete discontinued machine part',
    normalized,
    {limit:2}
  );
  assert.equal(hits[0].public_id,'findmypart-paid-hunt-v1');
  assert.ok(hits[0].match_score>0);
});

test('Fabric ranks the direct parts specialist for natural discontinued-part language',()=>{
  const canonical=loadFabricCatalogFromRepository();
  const hits=matchFabricCapabilities(
    'I need help finding a discontinued hydraulic valve that I cannot locate through normal suppliers.',
    canonical,
    {limit:5}
  );
  assert.equal(hits[0].public_id,'findmypart-paid-hunt-v1');
  assert.ok(hits[0].match_score>0);
});

test('Fabric routes unknown physical-part identity to the free Part Passport before software-health tools',()=>{
  const canonical=loadFabricCatalogFromRepository();
  assert.ok(canonical.some((x)=>x.public_id==='findmypart-part-passport-v1'));
  const hits=matchFabricCapabilities(
    'I have an old machine with a broken part. I can see some markings and take a photo but I do not know what the part is called or what replacement fits.',
    canonical,
    {limit:8}
  );
  assert.equal(hits[0].public_id,'findmypart-part-passport-v1');
  const sentinel=hits.find((x)=>x.public_id==='portfolio-sentinel-v1');
  assert.ok(!sentinel || sentinel.match_score < hits[0].match_score);
});

test('Fabric routes explicit salvage blueprint and fabrication sourcing to the paid FindMyPart hunt',()=>{
  const canonical=loadFabricCatalogFromRepository();
  const hits=matchFabricCapabilities(
    'The original part is obsolete and I may need a salvage donor, cross reference, blueprint, or fabrication path.',
    canonical,
    {limit:5}
  );
  assert.equal(hits[0].public_id,'findmypart-paid-hunt-v1');
  assert.ok(hits[0].match_score>0);
});

test('Fabric MCP exposes exactly the read-only directory contract',async()=>{
  const init=await executeFabricDirectoryRpc({
    jsonrpc:'2.0',id:1,method:'initialize',
    params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}},
  },catalog);
  assert.equal(init.result.protocolVersion,'2025-03-26');
  assert.equal(init.result.serverInfo.name,'evercraft-fabric');

  const listed=await executeFabricDirectoryRpc(
    {jsonrpc:'2.0',id:2,method:'tools/list',params:{}},
    catalog
  );
  assert.deepEqual(
    listed.result.tools.map((x)=>x.name),
    [
      'match_evercraft_capability',
      'list_evercraft_capabilities',
      'get_evercraft_connection_options',
    ]
  );
  assert.ok(listed.result.tools.every((x)=>x.annotations.readOnlyHint===true));
  assert.ok(listed.result.tools.every((x)=>x.annotations.destructiveHint===false));
  assert.equal(fabricDirectoryTools().length,3);
});

test('Fabric MCP publishes reviewer-grade argument descriptions',()=>{
  const tools=fabricDirectoryTools();
  for(const tool of tools){
    assert.ok(String(tool.description||'').length>20);
    for(const [name,schema] of Object.entries(tool.inputSchema?.properties||{})){
      assert.ok(
        String(schema.description||'').length>12,
        `${tool.name} input ${name} needs a useful description`
      );
    }
  }
});

test('Fabric MCP matches intent and never creates transaction authority',async()=>{
  const result=await executeFabricDirectoryRpc({
    jsonrpc:'2.0',
    id:3,
    method:'tools/call',
    params:{
      name:'match_evercraft_capability',
      arguments:{intent:'help me find a discontinued obsolete part cross reference',limit:1},
    },
  },catalog);
  assert.equal(result.result.structuredContent.matches[0].public_id,'findmypart-paid-hunt-v1');
  assert.equal(result.result.structuredContent.transactional,false);
  assert.equal(result.result.structuredContent.external_action_taken,false);
});

test('OpenAI challenge token validation fails closed',()=>{
  assert.equal(
    validateOpenAiChallengeToken('abcdefghijklmnopqrstuvwxyz_123456'),
    'abcdefghijklmnopqrstuvwxyz_123456'
  );
  assert.throws(()=>validateOpenAiChallengeToken('bad token with spaces'),/openai_challenge_token_invalid/);
});

test('owned Evercraft Compute MCP runtime serves challenge and Fabric without gateway dependency',async()=>{
  const challenge='OpenAIChallenge_abcdefghijklmnopqrstuvwxyz123456';
  let gatewayCalls=0;
  const runtime=await startSpecialistHandoffRuntime({
    host:'127.0.0.1',
    port:0,
    fabricCatalog:catalog,
    fabricMcpPath:'/mcp',
    openAiChallengeToken:challenge,
    gatewayFetch:async()=>{
      gatewayCalls+=1;
      throw new Error('gateway must not be called by Fabric directory');
    },
  });

  try{
    const challengeResponse=await fetch(runtime.url+'/.well-known/openai-apps-challenge');
    assert.equal(challengeResponse.status,200);
    assert.match(challengeResponse.headers.get('content-type')||'',/^text\/plain/);
    assert.equal(await challengeResponse.text(),challenge);

    const initResponse=await fetch(runtime.url+'/mcp',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'openai-probe',version:'1'}},
      }),
    });
    assert.equal(initResponse.status,200);
    const init=await initResponse.json();
    assert.equal(init.result.serverInfo.name,'evercraft-fabric');

    const toolsResponse=await fetch(runtime.url+'/mcp',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),
    });
    assert.equal(toolsResponse.status,200);
    const tools=await toolsResponse.json();
    assert.equal(tools.result.tools.length,3);
    assert.ok(tools.result.tools.every((x)=>x.annotations.readOnlyHint===true));

    const healthResponse=await fetch(runtime.url+'/health');
    const health=await healthResponse.json();
    assert.equal(health.fabric_directory_enabled,true);
    assert.equal(health.fabric_mcp_path,'/mcp');
    assert.equal(health.openai_challenge_ready,true);
    assert.equal(health.fabric_capability_count,2);
    assert.equal(JSON.stringify(health).includes(challenge),false);
    assert.equal(gatewayCalls,0);
  }finally{
    await runtime.close();
  }
});
