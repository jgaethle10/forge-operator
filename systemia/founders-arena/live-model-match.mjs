/** One-command *opt-in* local-model game runner. No model mocked or invented. */
import {writeFileSync} from 'node:fs';
import {startLocalModelBridge} from './local-model-bridge.mjs';
import {playWithLocalAgent} from './local-agent-runner.mjs';
import {verifyMatch,standings} from './league.mjs';
import {createInferenceEvidence,verifyInferenceEvidence} from './inference-evidence.mjs';

export async function runLiveLocalModelMatch({provider,endpoint,model,modelByAgent,rounds=3,seed=42,roster,timeoutMs=8000}={}){
  const audit=createInferenceEvidence();
  const bridge=await startLocalModelBridge({provider,endpoint,model,modelByAgent,timeoutMs,onDecisionEvidence:audit.observe});
  try {
    const match=await playWithLocalAgent({endpoint:bridge.address,rounds,seed,roster,timeoutMs:Math.min(30000,timeoutMs+1000)});
    verifyMatch(match);
    const evidence=audit.exportLedger(match);
    verifyInferenceEvidence(match,evidence);
    return {match,evidence,provider:{kind:provider,model,models:modelByAgent??{},
      request_count:bridge.metrics.requests,completion_count:bridge.metrics.completions,
      note:'Loopback provider responses observed; not an independent attestation of actual model computation.'},
      standings:standings(match.final)};
  }finally{await bridge.close();}
}

if(process.argv[1]?.endsWith('/live-model-match.mjs')){
  try{
    const [provider,endpoint,model,roundsText,output='founders-arena-local-model-match.json']=process.argv.slice(2);
    const rounds=roundsText===undefined?3:Number(roundsText);
    const result=await runLiveLocalModelMatch({provider,endpoint,model,rounds});
    writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({verified:true,turns:result.match.turns.length,
      digest:result.match.digest,provider:result.provider,standings:result.standings,artifact:output},null,2));
  }catch(err){console.error(err.message);process.exitCode=1;}
}
