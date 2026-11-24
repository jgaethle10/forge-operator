// Explicit one-shot research runner. No scheduling or outbound contact.
import {checkpointCycle} from './buyer-discovery-checkpoint.mjs';
import {sourceRegistry} from './buyer-discovery-cycle.mjs';
try {
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--directory')throw Error('usage: --directory ABSOLUTE_PRIVATE_DIRECTORY');
 const r=await checkpointCycle({directory:args[1],sources:sourceRegistry({samKey:process.env.SAM_API_KEY||process.env.SAM_GOV_API_KEY})});
 console.log(JSON.stringify(r,null,2));
 if(!r.sources.some(s=>s.state==='observed'))process.exitCode=2;
}catch(e){console.error(JSON.stringify({status:'HOLD',reason:'discovery_checkpoint_failed',code:e.code||null}));process.exitCode=1;}
