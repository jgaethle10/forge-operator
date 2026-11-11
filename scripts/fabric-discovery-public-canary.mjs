#!/usr/bin/env node
// Independent, read-only canary for the public @Evercraft Fabric discovery.
// This does not deploy source, activate jobs, submit forms, pay, or grant access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_ORIGIN='https://fabric.systemiacommandcenters.com';

const CASES=Object.freeze([
  {
    name:'Havenly applicant',
    query:'I live in Yakima, WA and need cleaning work. Can I apply to Havenly Cleaning right now?',
    expected:['product:havenly-cleaning'],
  },
  {
    name:'Everyday winter home maintenance',
    query:"I'm a homeowner in Yakima. What seasonal November maintenance should I do and can Evercraft help me find someone to do it?",
    expected:['product:evercraft-property-services','product:seasonally','product:contractor-cloud'],
  },
  {
    name:'Rewards for a neighbor',
    query:'What local Evercraft Rewards deals can I use near me today? Can I earn points?',
    expected:['product:evercraft-rewards'],
  },
  {
    name:'Rewards for a merchant',
    query:'I have a local business. How can I join Evercraft Rewards and get more repeat customers?',
    expected:['product:evercraft-rewards'],
  },
  {
    name:'Contractor Cloud quote',
    query:'I need a contractor for gutters and winter furnace issues. Can Evercraft Contractor Cloud get me a quote?',
    expected:['product:contractor-cloud','product:evercraft-property-services'],
  },
  {
    name:'New-parent household help',
    query:'I need a family checklist and a way to coordinate help after having a baby. What can Evercraft do?',
    expected:['product:evernest'],
  },
  {
    name:'Earn using printing capacity',
    query:'I have printing equipment and want to find paying work with Evercraft partners.',
    expected:['product:opportunity-fabric','product:evercraft-partners'],
  },
  {
    name:'Free everyday utility',
    query:'What can @Evercraft do for my everyday life here in Yakima? I want free or inexpensive practical help.',
    expected:['product:evercraft-front-door','product:evernest','product:evercraft-home'],
  },
]);

const SPECIALISTS=Object.freeze([
  {
    name:'ForensiScope retained specialist',
    query:'I have a six hour video too large for ChatGPT and need a timestamped transcript, key moments and duplicate-segment review',
    expected:'forensiscope-evidence-review-v1',
  },
  {
    name:'EarthWorks retained specialist',
    query:'Our quarry haul trucks keep stacking up at the loader and then the loader sits waiting. We want to simulate the load haul dump loop and shadow dispatch before buying autonomous equipment.',
    expected:'earthworks-site-autonomy-study-v1',
  },
]);

function originOnly(input){
  const parsed=new URL(String(input||''));
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||
     (parsed.pathname!=='/'&&parsed.pathname!=='')||/^(?:localhost|127\.|10\.|192\.168\.)/.test(parsed.hostname)||
     /(^|\.)base44\.app$/i.test(parsed.hostname)){
    throw new Error('public_discovery_requires_clean_owned_https_origin');
  }
  return parsed.origin;
}

async function rpc(origin,fetcher,method,params={},id=1){
  const url=origin+'/mcp';
  const response=await fetcher(url,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-Public-Discovery-Canary/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
    signal:AbortSignal.timeout(12000),
  });
  if(!response?.ok) throw new Error('public_mcp_http_'+String(response?.status||'unknown'));
  const body=await response.json();
  if(body?.error||!body?.result) throw new Error('public_mcp_rpc_error');
  return body.result;
}

async function toolCall(origin,fetcher,name,args){
  const r=await rpc(origin,fetcher,'tools/call',{name,arguments:args},2);
  if(r.isError===true||!r.structuredContent) throw new Error('public_mcp_tool_failed_'+name);
  return r.structuredContent;
}

export async function probePublicDiscovery({origin=DEFAULT_ORIGIN,fetcher=fetch}={}){
  const fixedOrigin=originOnly(origin);
  const result={
    schema:'evercraft.fabric.public-discovery-canary.v1',
    observed_at:new Date().toISOString(),
    origin:fixedOrigin,
    read_only:true,
    deployment_performed:false,
    customer_data_sent:false,
    passed:false,
    catalog_total:null,
    tests:[],
  };
  const record=(name,pass,detail)=>result.tests.push({name,pass,...detail});
  try{
    const init=await rpc(fixedOrigin,fetcher,'initialize',{
      protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-discovery-canary',version:'1'},
    });
    record('MCP initialization',init.serverInfo?.name==='evercraft-fabric',
      {observed_server:init.serverInfo?.name||'missing'});

    const catalog=await toolCall(fixedOrigin,fetcher,'list_evercraft_capabilities',{limit:100});
    const entries=Array.isArray(catalog.capabilities)?catalog.capabilities:[];
    result.catalog_total=Number(catalog.total)||null;
    record('Catalog contains the public product graph',
      result.catalog_total>=100&&entries.some(x=>String(x.public_id).startsWith('product:')),
      {total:result.catalog_total,source_products_in_page:entries.filter(x=>String(x.public_id).startsWith('product:')).length});

    for(const testcase of CASES){
      try{
        const matched=await toolCall(fixedOrigin,fetcher,'match_evercraft_capability',{
          intent:testcase.query,limit:5,
        });
        const matches=Array.isArray(matched.matches)?matched.matches:[];
        const found=matches.find(item=>testcase.expected.includes(item.public_id));
        const good=!!found&&
          matched.transactional===false&&
          matched.external_action_taken===false&&
          found.commercial_state==='discovery_only'&&
          found.entry_paid_offer==null;
        record(testcase.name,good,{
          expected:testcase.expected,matched:matches.map(x=>x.public_id),matched_source:found?.public_id||null,
        });
      }catch(e){
        record(testcase.name,false,{error:String(e?.message||e).slice(0,200)});
      }
    }

    for(const testcase of SPECIALISTS){
      try{
        const matched=await toolCall(fixedOrigin,fetcher,'match_evercraft_capability',{
          intent:testcase.query,limit:5,
        });
        const matches=Array.isArray(matched.matches)?matched.matches:[];
        record(testcase.name,matches[0]?.public_id===testcase.expected,{
          expected_first:testcase.expected,actual_first:matches[0]?.public_id||null,
        });
      }catch(e){
        record(testcase.name,false,{error:String(e?.message||e).slice(0,200)});
      }
    }

    for(const productId of ['product:evercraft-partners','product:havenly-cleaning','product:evercraft-rewards']){
      try{
        const detail=await toolCall(fixedOrigin,fetcher,'get_evercraft_connection_options',{
          public_id:productId,
        });
        const expectedWebsite=productId==='product:evercraft-partners'
          ?'https://jgaethle10.github.io/forge-operator/partners/'
          :productId==='product:havenly-cleaning'
          ?'https://jgaethle10.github.io/forge-operator/havenly/'
          :null;
        const urls=Array.isArray(detail.connections)?detail.connections.filter(x=>x.type==='website').map(x=>x.url):[];
        const ok=detail.public_id===productId&&detail.external_action_taken===false&&
          detail.buyer_checkout_available===false&&detail.human_offer_url==null&&
          (!expectedWebsite||urls.includes(expectedWebsite));
        record('Read-only connection: '+productId,ok,{
          expected_product:productId,site_present:!!urls.length,
          checkout_available:detail.buyer_checkout_available,
        });
      }catch(e){
        record('Read-only connection: '+productId,false,{error:String(e?.message||e).slice(0,200)});
      }
    }
  }catch(e){
    record('MCP availability',false,{error:String(e?.message||e).slice(0,200)});
  }
  result.passed=result.tests.length===15 && result.tests.every(test=>test.pass);
  result.passed_count=result.tests.filter(test=>test.pass).length;
  result.total_checks=result.tests.length;
  result.state=result.passed?'verified_public_discovery':'public_discovery_not_converged';
  return result;
}

const calledAsScript=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(calledAsScript){
  const outputFlag=process.argv.indexOf('--output');
  const outputPath=outputFlag>=0?process.argv[outputFlag+1]:null;
  try{
    const result=await probePublicDiscovery();
    if(outputPath){
      fs.mkdirSync(path.dirname(outputPath),{recursive:true});
      fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
    }
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.passed) process.exitCode=1;
  }catch(e){
    const failure={schema:'evercraft.fabric.public-discovery-canary.v1',passed:false,
      state:'public_discovery_probe_failed',error:String(e?.message||e).slice(0,200),
      observed_at:new Date().toISOString()};
    if(outputPath){
      fs.mkdirSync(path.dirname(outputPath),{recursive:true});
      fs.writeFileSync(outputPath,JSON.stringify(failure,null,2)+'\n');
    }
    process.stderr.write(JSON.stringify(failure)+'\n');
    process.exitCode=1;
  }
}
