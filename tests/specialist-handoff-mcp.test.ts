import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSpecialistMcpRpc, specialistHandoffDefinitions } from '../systemia/mcp/specialist-handoff.ts';

test('all staged specialist handoff MCPs initialize and expose exactly two safe tools', async () => {
  for (const def of specialistHandoffDefinitions) {
    const init:any = await executeSpecialistMcpRpc(def, {
      jsonrpc:'2.0', id:1, method:'initialize',
      params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}
    }, async()=>{ throw new Error('gateway must not be called during initialize'); });

    assert.equal(init.result.serverInfo.name, def.serverName);
    assert.equal(init.result.protocolVersion, '2025-03-26');

    const tools:any = await executeSpecialistMcpRpc(def, {jsonrpc:'2.0',id:2,method:'tools/list',params:{}}, async()=>{
      throw new Error('gateway must not be called during tools/list');
    });

    assert.equal(tools.result.tools.length, 2);
    assert.deepEqual(tools.result.tools.map((x:any)=>x.name), [def.getOfferTool, def.prepareHandoffTool]);
    assert.ok(tools.result.tools.every((x:any)=>x.annotations.readOnlyHint === true));
    assert.ok(tools.result.tools.every((x:any)=>x.annotations.destructiveHint === false));
  }
});

test('offer call is pinned to each specialist public id and preserves no-payment boundary', async () => {
  for (const def of specialistHandoffDefinitions) {
    const calls:any[]=[];
    const response:any = await executeSpecialistMcpRpc(def, {
      jsonrpc:'2.0',id:3,method:'tools/call',params:{name:def.getOfferTool,arguments:{}}
    }, async(action,publicId)=>{
      calls.push({action,publicId});
      return {ok:true,offer:{public_id:publicId,pricing:'test'}};
    });

    assert.deepEqual(calls,[{action:'offer',publicId:def.publicId}]);
    assert.equal(response.result.structuredContent.direct_specialist,true);
    assert.equal(response.result.structuredContent.payment_created,false);
    assert.equal(response.result.structuredContent.payment_obligation_created,false);
  }
});

test('handoff call uses service_handoff and cannot silently create payment', async () => {
  for (const def of specialistHandoffDefinitions) {
    const calls:any[]=[];
    const response:any = await executeSpecialistMcpRpc(def, {
      jsonrpc:'2.0',id:4,method:'tools/call',params:{name:def.prepareHandoffTool,arguments:{}}
    }, async(action,publicId)=>{
      calls.push({action,publicId});
      return {
        ok:true,
        public_id:publicId,
        handoff_url:'https://example.invalid/review',
        checkout_created:false,
        payment_created:false,
        payment_obligation_created:false,
        human_action_required:true
      };
    });

    assert.deepEqual(calls,[{action:'service_handoff',publicId:def.publicId}]);
    assert.equal(response.result.structuredContent.payment_created,false);
    assert.equal(response.result.structuredContent.payment_obligation_created,false);
    assert.equal(response.result.structuredContent.human_action_required,true);
  }
});

test('unknown specialist tools fail closed', async () => {
  const def=specialistHandoffDefinitions[0];
  const response:any=await executeSpecialistMcpRpc(def,{
    jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'buy_now',arguments:{}}
  },async()=>{throw new Error('gateway must not be called');});
  assert.equal(response.error.code,-32602);
});
