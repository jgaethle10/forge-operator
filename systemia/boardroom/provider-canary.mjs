// Private, source-owned xAI + Anthropic provider readiness and bounded live test.
// Never log API keys, prompts from customers, external contact details or provider responses.
import {pathToFileURL} from 'node:url';
import {configuredProviders} from './providers.mjs';

const REQUIRED=[
  {id:'anthropic',key:'ANTHROPIC_API_KEY',model:'BOARDROOM_ANTHROPIC_MODEL'},
  {id:'xai',key:'XAI_API_KEY',model:'BOARDROOM_XAI_MODEL'}
];
export function providerReadiness(env=process.env){
  return {
    schema:'evercraft.boardroom.provider-canary.v1',
    providers:REQUIRED.map(p=>({provider:p.id,configured:Boolean(env[p.key]&&env[p.model]),
      missing:[p.key,p.model].filter(k=>!env[k])})),
    eligible_for_live:REQUIRED.every(p=>env[p.key]&&env[p.model]),
    live_verified:false
  };
}
export async function probeProviders({env=process.env,transport=fetch}={}){
  const configuration=providerReadiness(env);
  if(!configuration.eligible_for_live)return {...configuration,status:'held_missing_configuration',checks:[]};
  const live=configuredProviders(env,transport);
  const results=await Promise.all(REQUIRED.map(async ({id})=>{
    const provider=live.find(x=>x.id===id);
    if(!provider)return {provider:id,passed:false,reason:'adapter_unavailable'};
    try{
      const response=await provider.respond({
        system:'This is an Evercraft private model connectivity canary. Do not use customer data or interact with any third party.',
        user:'Reply with the single word READY. Do not perform any actions.',
        maxTokens:64
      });
      return {provider:id,passed:typeof response?.text==='string'&&response.text.trim().length>0,
        reason:response?.text?.trim()?'response_received':'empty_response'};
    }catch{return {provider:id,passed:false,reason:'provider_request_failed'};}
  }));
  const passed=results.every(x=>x.passed);
  return {...configuration,live_verified:passed,status:passed?'live_provider_canary_pass':'live_provider_canary_fail',
    checked_at:new Date().toISOString(),checks:results,
    note:'Provider connectivity only. Does not prove a resident Systemia heartbeat worker, approved outbound sends, or paid fulfillment.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const mode=process.argv[2]||'--status';
  if(!['--status','--live'].includes(mode)){
    process.stderr.write('Usage: node systemia/boardroom/provider-canary.mjs [--status|--live]\n');
    process.exitCode=2;
  }else{
    const report=mode==='--live'?await probeProviders():providerReadiness();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(mode==='--live'&&!report.live_verified)process.exitCode=1;
  }
}
