#!/usr/bin/env node
// On-node, zero-inference local model inventory probe.
// Does NOT install/start services, alter configuration, or contact cloud.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { probeOwnedLocalModel } from './owned-local-model-probe.mjs';

function argsToOptions(argv) {
  const allowed=new Set(['--provider','--origin','--model']);
  const out={};
  if(argv.includes('--help')) return {help:true};
  for(let i=0;i<argv.length;i+=2) {
    if(!allowed.has(argv[i]) || !argv[i+1] || argv[i+1].startsWith('--')) {
      throw Error('INVALID_ARGUMENTS');
    }
    if(Object.hasOwn(out,argv[i])) throw Error('DUPLICATE_ARGUMENT');
    out[argv[i]]=argv[i+1];
  }
  return {provider:out['--provider']||'llama-cpp',
    origin:out['--origin']||'',model:out['--model']||''};
}

export async function runOwnedLocalProbeCli({
  argv=process.argv.slice(2),probe=probeOwnedLocalModel,
  stdout=process.stdout,stderr=process.stderr
}={}) {
  let options;
  try { options=argsToOptions(argv); }
  catch {
    stderr.write('Usage: node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider llama-cpp --origin http://127.0.0.1:36095 [--model MODEL_ID]\n');
    return 2;
  }
  if(options.help) {
    stdout.write([
      'Owned-local read-only model-list probe. No inference, no cloud, no secrets, no install.',
      'Example: node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider llama-cpp --origin http://127.0.0.1:36095',
      'Or: --provider ollama --origin http://127.0.0.1:11434',
      'Results are local observations, NOT permission to dispatch missions.'].join('\n')+'\n');
    return 0;
  }
  const result=await probe(options);
  stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.status === 'observed' ? 0 : 3;
}

const invoked=process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(invoked){
  runOwnedLocalProbeCli().then(code=>{process.exitCode=code;}).catch(()=>{
    // Avoid logging raw provider errors or credential-bearing URLs.
    process.stderr.write('Probe held: local metadata observation failed.\n');
    process.exitCode=4;
  });
}
