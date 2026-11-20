import test from 'node:test';
import assert from 'node:assert/strict';
import {providerReadiness,probeProviders} from '../systemia/boardroom/provider-canary.mjs';
const env={ANTHROPIC_API_KEY:'private-a',BOARDROOM_ANTHROPIC_MODEL:'claude-test',
 XAI_API_KEY:'private-x',BOARDROOM_XAI_MODEL:'grok-test'};
test('readiness holds without both privately configured providers',()=>{
 const r=providerReadiness({ANTHROPIC_API_KEY:'private-a',BOARDROOM_ANTHROPIC_MODEL:'claude'});
 assert.equal(r.eligible_for_live,false);assert.equal(r.live_verified,false);
 assert.equal(r.providers[1].configured,false);
 assert.ok(!JSON.stringify(r).includes('private-a'));
});
test('live canary requires real independent xAI and Anthropic requests',async()=>{
 const called=[];
 const fake=async(url,opts)=>{called.push({url,opts});
  if(url.includes('anthropic.com'))return {ok:true,json:async()=>({content:[{type:'text',text:'READY'}]})};
  return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'READY'}]}]})};
 };
 const r=await probeProviders({env,transport:fake});
 assert.equal(r.live_verified,true);assert.equal(r.checks.length,2);
 assert.equal(called.length,2);
 assert.ok(called.some(c=>c.url==='https://api.x.ai/v1/responses'));
 assert.ok(called.some(c=>c.url==='https://api.anthropic.com/v1/messages'));
 assert.equal(JSON.parse(called.find(c=>c.url.includes('x.ai')).opts.body).store,false);
 assert.ok(!JSON.stringify(r).includes('private-'));
});
test('provider errors fail closed, do not print secrets or fabricate health',async()=>{
 const fake=async(url)=>{if(url.includes('x.ai'))throw new Error('LEAK_PRIVATE_SECRET');
  return {ok:true,json:async()=>({content:[{type:'text',text:'READY'}]})};
 };
 const r=await probeProviders({env,transport:fake});
 assert.equal(r.live_verified,false);
 assert.equal(r.status,'live_provider_canary_fail');
 assert.equal(r.checks.find(x=>x.provider==='xai').reason,'provider_request_failed');
 assert.ok(!JSON.stringify(r).includes('LEAK_PRIVATE_SECRET'));
});
