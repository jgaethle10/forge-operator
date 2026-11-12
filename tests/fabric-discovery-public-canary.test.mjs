import test from 'node:test';
import assert from 'node:assert/strict';
import {probePublicDiscovery,DEFAULT_ORIGIN} from '../scripts/fabric-discovery-public-canary.mjs';

const namedMatch=[
  ['Havenly Cleaning','product:havenly-cleaning'],
  ['seasonal November','product:seasonally'],
  ['Evercraft Rewards','product:evercraft-rewards'],
  ['Contractor Cloud','product:contractor-cloud'],
  ['after having a baby','product:evernest'],
  ['printing equipment','product:opportunity-fabric'],
  ['everyday life','product:evercraft-front-door'],
  ['six hour video','forensiscope-evidence-review-v1'],
  ['quarry haul trucks','earthworks-site-autonomy-study-v1'],
];

function fetchFixture({total=123,wrongSpecialist=false,paid=false}={}){
  const calls=[];
  const fetcher=async (url,options)=>{
    calls.push({url,method:options.method,body:JSON.parse(options.body)});
    assert.equal(url,DEFAULT_ORIGIN+'/mcp');
    assert.equal(options.method,'POST');
    const input=JSON.parse(options.body);
    let result;
    if(input.method==='initialize'){
      result={serverInfo:{name:'evercraft-fabric'}};
    }else if(input.method==='tools/call'){
      const tool=input.params.name,args=input.params.arguments;
      let data;
      if(tool==='list_evercraft_capabilities'){
        data={total,capabilities:[
          {public_id:'findmypart-part-passport-v1'},
          {public_id:'product:evercraft-rewards'},
        ]};
      }else if(tool==='match_evercraft_capability'){
        const query=args.intent;
        const found=namedMatch.find(([needle])=>query.includes(needle));
        const publicId=found?.[1]||'unknown';
        const resolved=wrongSpecialist&&publicId==='forensiscope-evidence-review-v1'
          ?'product:forensiscope':publicId;
        data={matches:[{public_id:resolved,
          commercial_state:resolved.startsWith('product:')?'discovery_only':'verification_required',
          entry_paid_offer:null}],transactional:false,external_action_taken:false};
      }else if(tool==='get_evercraft_connection_options'){
        const id=args.public_id;
        data={
          public_id:id,
          external_action_taken:false,
          buyer_checkout_available:paid,
          human_offer_url:null,
          connections:[{
            type:'website',
            url:id==='product:evercraft-partners'
              ?'https://jgaethle10.github.io/forge-operator/partners/'
              :id==='product:havenly-cleaning'
              ?'https://jgaethle10.github.io/forge-operator/havenly/'
              :'https://jgaethle10.github.io/forge-operator/chum/products/evercraft-rewards/',
          }],
        };
      }else throw new Error('unexpected tool');
      result={isError:false,structuredContent:data};
    }else throw new Error('unexpected MCP method');
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:input.id,result})};
  };
  return {fetcher,calls};
}

test('external canary passes 15 public-read-only acceptance checks with no side effects',async()=>{
  const {fetcher,calls}=fetchFixture();
  const result=await probePublicDiscovery({fetcher});
  assert.equal(result.passed,true,JSON.stringify(result,null,2));
  assert.equal(result.passed_count,15);
  assert.equal(result.total_checks,15);
  assert.equal(result.state,'verified_public_discovery');
  assert.equal(result.deployment_performed,false);
  assert.equal(result.customer_data_sent,false);
  assert.ok(calls.every(call=>['initialize','tools/call'].includes(call.body.method)));
  assert.equal(calls.some(call=>call.body.params?.name==='purchase'),false);
});

test('old 55-capability production catalog fails even if matching is superficially plausible',async()=>{
  const {fetcher}=fetchFixture({total:55});
  const result=await probePublicDiscovery({fetcher});
  assert.equal(result.passed,false);
  assert.equal(result.state,'public_discovery_not_converged');
  assert.equal(result.tests.find(x=>x.name==='Catalog contains the public product graph').pass,false);
});

test('specialist regression fails closed',async()=>{
  const {fetcher}=fetchFixture({wrongSpecialist:true});
  const result=await probePublicDiscovery({fetcher});
  assert.equal(result.passed,false);
  assert.equal(result.tests.find(x=>x.name==='ForensiScope retained specialist').pass,false);
});

test('buyer checkout visibility is rejected for a source-only product',async()=>{
  const {fetcher}=fetchFixture({paid:true});
  const result=await probePublicDiscovery({fetcher});
  assert.equal(result.passed,false);
  assert.ok(result.tests.some(x=>x.name.startsWith('Read-only connection:')&&!x.pass));
});

test('clean owned HTTPS origin required and Base44/loopback are never contacted',async()=>{
  const {fetcher,calls}=fetchFixture();
  for(const origin of [
    'http://fabric.systemiacommandcenters.com',
    'https://fabric.systemiacommandcenters.com/private',
    'https://my-app.base44.app',
    'https://127.0.0.1',
    'https://fabric.systemiacommandcenters.com/?token=bad',
  ]){
    await assert.rejects(probePublicDiscovery({origin,fetcher}),
      /public_discovery_requires_clean_owned_https_origin/);
  }
  assert.equal(calls.length,0);
});
