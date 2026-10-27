#!/usr/bin/env node
// Public, self-service alpha-readiness receipt. No auth, uploads, registration,
// environmental inventory, hostname, customer data, commerce, or deployment.
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {probeFabric} from './public-discovery.mjs';

const base=dirname(fileURLToPath(import.meta.url));
const flags=process.argv.slice(2);
const claimFlags={
  external_human_tested:false,
  external_developer_approved:false,
  contribution_published:false,
  public_tool_invoked:false,
  production_authorized:false,
  provider_payment_verified:false,
};
function normalizeError(e){
  const msg=String(e instanceof Error?e.message:e);
  // Use fixed categories only: never echo remote response bodies or credentials.
  if(/MCP.*HTTP status|MCP.*HTTP/.test(msg))return 'remote_http_failure';
  if(/fetch failed|timeout|aborted|network/i.test(msg))return 'network_unavailable';
  if(/identity mismatch/i.test(msg))return 'mcp_server_identity_mismatch';
  if(/matching result/i.test(msg))return 'capability_match_failed';
  if(/discovery tools/i.test(msg))return 'discovery_tool_contract_changed';
  if(/offer|buyer/i.test(msg))return 'owned_offer_contract_changed';
  if(/signature|review/i.test(msg))return 'lab_review_failed';
  return 'verification_failed';
}
export function offlineProof({exec=spawnSync,reader=readdirSync}={}){
  const files=reader(join(base,'test')).filter(x=>x.endsWith('.test.mjs')).sort();
  if(files.length<3)throw Error('Expected lab tests missing');
  const result=exec(process.execPath,['--test',...files.map(x=>join(base,'test',x))],{
    encoding:'utf8',timeout:30000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH||'',NODE_OPTIONS:''},
  });
  if(result.error||result.signal||result.status!==0)throw Error('Local MCP suite failed');
  const output=result.stdout||'';
  const num=(key)=>{
    const m=output.match(new RegExp('^# '+key+' (\\d+)$','m'));
    return m?Number(m[1]):NaN;
  };
  const total=num('tests'),passed=num('pass'),failed=num('fail');
  if(!Number.isSafeInteger(total)||total<19||passed!==total||failed!==0)
    throw Error('Local MCP suite reported incomplete test coverage');
  return {
    state:'isolated_lab_tests_passed',
    suite:'operator_fabric_independent_client_signed_review_loopback',
    test_files:files.length,tests_total:total,tests_passed:passed,tests_failed:failed,
    host_external:false,public_fabric_mutated:false,
  };
}
export async function operatorPilotReceipt(mode,{offline=offlineProof,live=probeFabric,clock=()=>new Date()}={}){
  if(!['offline','live'].includes(mode))throw Error('Choose --offline or --live');
  const receipt={
    schema:'evercraft.operator-alpha-self-check.v1',
    generated_at:clock().toISOString(),
    mode,
    self_reported_by_human:false,
    independent_contributor_identity_verified:false,
    claims:claimFlags,
    result:null,
    ok:false,
  };
  try{
    if(mode==='offline')receipt.result=offline();
    else {
      const r=await live();
      if(r?.state!=='read_only_public_discovery_verified'
        ||r.server_name!=='evercraft-fabric'
        ||r.matched_public_id!=='findmypart-paid-hunt-v1'
        ||r.verified_payment!==false
        ||r.checkout_created!==false)throw Error('Public read-only discovery verification failed');
      receipt.result={
        state:r.state,
        observed_at:r.observed_at,
        origin:r.origin,
        server_name:r.server_name,
        verified_discovery_tools:r.available_read_only_tools,
        matched_public_id:r.matched_public_id,
        owned_offer_url:r.human_offer_url,
        read_only:true,
      };
    }
    receipt.ok=true;
  }catch(e){
    receipt.error_code=normalizeError(e);
    receipt.result=null;
  }
  return receipt;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const mode=flags.length===1&&flags[0]==='--offline'?'offline':
             flags.length===1&&flags[0]==='--live'?'live':null;
  if(!mode){console.error('Usage: node examples/operator-fabric/pilot-check.mjs --offline|--live');process.exitCode=2;}
  else operatorPilotReceipt(mode).then(r=>{
    process.stdout.write(JSON.stringify(r,null,2)+'\n');
    if(!r.ok)process.exitCode=1;
  }).catch(()=>{console.error('Alpha pilot verification did not complete');process.exitCode=1;});
}
