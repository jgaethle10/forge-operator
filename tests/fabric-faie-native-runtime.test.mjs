import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const catalog=[{
  public_id:'faie-signal-brief-v1',
  name:'FAIE Evidence-First Signal Brief',
  description:'Evidence-first food infrastructure and resilience intelligence.',
  keywords:['food infrastructure','agriculture','water','soil'],
  state:'payment_ready',
  commercial_state:'sell_now',
  pricing:'Signal Brief $250 one-time; Proof Sprint $2,500 one-time.',
  use_when:['underwrite a food infrastructure site'],
  entry_paid_offer:{name:'FAIE Signal Brief',price:'$250',billing:'one_time',price_usd_normalized:250},
  connections:[{
    type:'mcp',
    label:'Evercraft universal MCP',
    url:'https://fabric.systemiacommandcenters.com/mcp'
  }]
}];

test('owned Fabric serves FAIE UI, public preview API, and native FAIE MCP without Base44',async()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-faie-'));
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    faieStateDir:stateDir,
    faieCollectorConfig:{
      enabled:false,
      region_profile:{profile_id:'test-disabled'},
      nws_enabled:false,
      nws_area:null,
      usgs_water_sites:[],
      usgs_water_parameters:[],
      nwps_gauges:[]
    }
  });

  try{
    const rootHealth=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(rootHealth.faie_native_surface,true);
    assert.equal(rootHealth.faie_public_path,'/faie/');
    assert.equal(rootHealth.faie_mcp_path,'/mcp/faie');
    assert.equal(rootHealth.faie_base44_transport_enabled,false);
    assert.equal(rootHealth.base44_transport_enabled,false);

    const pageResponse=await fetch(runtime.url+'/faie/');
    assert.equal(pageResponse.status,200);
    assert.match(pageResponse.headers.get('content-type')||'',/^text\/html/);
    assert.match(pageResponse.headers.get('content-security-policy')||'',/connect-src 'self'/);
    const page=await pageResponse.text();
    assert.match(page,/Evidence for the physical world/);
    assert.match(page,/Underwrite the world beneath the thesis/);
    assert.match(page,/Compare candidate regions/);
    assert.match(page,/AgNormal \/ Yakima Valley/);
    assert.match(page,/Run live AgNormal brief/);
    assert.match(page,/fetchWithTimeout/);
    assert.match(page,/FAIE did not answer within 15 seconds/);
    assert.match(page,/id="activityHud"/);
    assert.match(page,/window\.EvercraftActivity = evercraftActivity/);
    assert.match(page,/Cancel operation/);
    assert.match(page,/Download handed off/);
    assert.match(page,/browser download was started/);
    assert.match(page,/operation-step/);
    const inlineScript=page.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inlineScript,'FAIE should expose its inline interaction script');
    assert.doesNotThrow(()=>new Function(inlineScript[1]),'FAIE inline interaction script must parse');
    assert.match(page,/Prepared for AgNormal · design-partner room/);
    assert.match(page,/One real decision\. Live evidence\. No theater\./);
    assert.match(page,/data-partner-mission="water"/);
    assert.match(page,/data-partner-mission="diligence"/);
    assert.doesNotMatch(page,/legacy provider_transport_enabled/);
    assert.match(page,/Official MCP Registry/);
    assert.match(page,/Human review required/);
    assert.match(page,/external action taken/);
    assert.doesNotMatch(page,/placeholder="greenhouse"/i);
    assert.match(page,/params\.get\('pilot'\)/);
    assert.match(page,/=== 'agnormal'/);
    assert.match(page,/io\.github\.jgaethle10\/faie/);
    assert.match(page,/partnerPath = \/\\\/faie\\\/agnormal/);
    assert.equal(/base44\.app/i.test(page),false);

    const partnerPageResponse=await fetch(runtime.url+'/faie/agnormal/');
    assert.equal(partnerPageResponse.status,200);
    assert.match(partnerPageResponse.headers.get('content-type')||'',/^text\/html/);
    const partnerPage=await partnerPageResponse.text();
    assert.match(partnerPage,/Prepared for AgNormal · design-partner room/);

    const faieHealthResponse=await fetch(runtime.url+'/api/faie/health');
    assert.equal(faieHealthResponse.status,200);
    const faieHealth=await faieHealthResponse.json();
    assert.equal(faieHealth.fabric_native,true);
    assert.equal(faieHealth.public_surface,'/faie/');
    assert.equal(faieHealth.design_partner_surface,'/faie/agnormal/');
    assert.equal(faieHealth.base44_transport_enabled,false);
    assert.equal(faieHealth.decision_authority,false);

    const investigateResponse=await fetch(runtime.url+'/api/faie/investigate',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        question:'What evidence should shape food infrastructure resilience in Yakima?',
        region_keys:['yakima-wa'],
        asset_types:['regional food production infrastructure'],
        thesis_assumptions:['Regional water availability can support the target production system.']
      })
    });
    assert.equal(investigateResponse.status,200);
    const investigation=await investigateResponse.json();
    assert.equal(investigation.schema,'evercraft.faie.investigation.v1');
    assert.equal(investigation.scope.region_keys[0],'yakima-wa');
    assert.equal(investigation.decision_authority,false);

    const beforeCount=(await fetch(runtime.url+'/api/faie/health').then((r)=>r.json())).investigation_count;
    assert.equal(beforeCount,0,'public preview must remain ephemeral');

    const mcpHealth=await fetch(runtime.url+'/mcp/faie?action=health').then((r)=>r.json());
    assert.equal(mcpHealth.server,'evercraft-faie');
    assert.equal(mcpHealth.runtime,'Evercraft Fabric / Systemia');
    assert.equal(mcpHealth.base44_transport_enabled,false);
    assert.deepEqual(mcpHealth.tools,[
      'investigate_faie_evidence',
      'compare_faie_candidates',
      'get_faie_signal_snapshot',
      'get_faie_health'
    ]);

    const initialized=await fetch(runtime.url+'/mcp/faie',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',
        id:1,
        method:'initialize',
        params:{
          protocolVersion:'2025-03-26',
          capabilities:{},
          clientInfo:{name:'fabric-faie-test',version:'1'}
        }
      })
    }).then((r)=>r.json());
    assert.equal(initialized.result.serverInfo.name,'evercraft-faie');

    const listed=await fetch(runtime.url+'/mcp/faie',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})
    }).then((r)=>r.json());
    assert.deepEqual(
      listed.result.tools.map((tool)=>tool.name),
      mcpHealth.tools
    );
    assert.ok(listed.result.tools.every((tool)=>tool.annotations.readOnlyHint===true));
  }finally{
    await runtime.close();
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});
