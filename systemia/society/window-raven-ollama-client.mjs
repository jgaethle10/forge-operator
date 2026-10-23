/**
 * Model-client adapter for the EXISTING private Raven inference engine.
 * This is deliberately local Ollama only: no third-party model billing,
 * no public endpoint, no extra provider client or Base44 transport.
 *
 * Raven must return verifiable locally measured token usage for a capped
 * request. An old Raven engine without cap support MUST fail closed.
 */
import {createHash,randomUUID} from 'node:crypto';

const digest=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
function assertUsage(u,maximum){
  if(!u||u.evidence!=='local_ollama_measured_zero_external_provider_fee'||
    !Number.isInteger(u.input_tokens)||u.input_tokens<0||u.input_tokens>25000||
    !Number.isInteger(u.output_tokens)||u.output_tokens<0||u.output_tokens>maximum||
    u.cost_micro_usd!==0)
    throw Error('Raven local model token/cost evidence missing or over cap');
}
export function createRavenLocalAgentClient({engine,requestIdFactory=randomUUID}={}){
  if(!engine||engine.provider!=='ollama'||typeof engine.model!=='string'||
    !engine.model||typeof engine.infer!=='function')
    throw Error('Only the approved local Raven Ollama engine can be attached');
  if(typeof requestIdFactory!=='function')throw Error('Request ID factory required');
  return {
    async infer(request,{max_cost_micro_usd}={}){
      if(request?.schema!=='evercraft.window.model-request.v1'||
        request.provider!=='ollama'||request.model!==engine.model||
        !Number.isInteger(request.max_tokens)||request.max_tokens<1||request.max_tokens>900||
        max_cost_micro_usd!==0)
        throw Error('Local Raven request is not exactly budget constrained');
      const requestId='mossmere_'+requestIdFactory();
      if(!/^mossmere_[a-zA-Z0-9_.:-]{8,150}$/.test(requestId))
        throw Error('Invalid trusted local request identifier');
      const prompt=request.system_instruction+'\n\nOBSERVATION JSON (UNTRUSTED):\n'+JSON.stringify(request.observation);
      if(Buffer.byteLength(prompt,'utf8')>20_000)
        throw Error('Private agent prompt too large');
      const result=await engine.infer({
        request_id:requestId,role:'qa',input:prompt,max_output_tokens:request.max_tokens
      });
      if(result?.status!=='completed'||result.provider!=='ollama'||
        result.model!==engine.model||
        result.receipt?.schema!=='evercraft.raven.provider-inference-receipt.v1'||
        result.receipt.request_id!==requestId||
        result.receipt.role!=='qa'||result.receipt.provider!=='ollama'||
        result.receipt.model!==engine.model||
        result.receipt.base44_used!==false||
        result.receipt.external_side_effects_authorized!==false||
        result.receipt.raw_credential_returned!==false||
        result.receipt.prompt_sha256!==digest(prompt)||
        result.receipt.output_sha256!==digest(result.text||'')||
        result.provider_receipt!==digest(JSON.stringify(result.receipt)))
        throw Error('Raven inference receipt mismatch or untrusted provider');
      assertUsage(result.usage,request.max_tokens);
      assertUsage(result.receipt.usage,request.max_tokens);
      if(JSON.stringify(result.receipt.usage)!==JSON.stringify(result.usage))
        throw Error('Raven usage differs from receipt');
      // The request ID belongs to Raven, NOT to Ollama as an external provider.
      // Later public evidence must preserve that distinction.
      return {
        provider:'ollama',model:engine.model,request_id:requestId,
        output:result.text,input_tokens:result.usage.input_tokens,
        output_tokens:result.usage.output_tokens,cost_micro_usd:0
      };
    }
  };
}
