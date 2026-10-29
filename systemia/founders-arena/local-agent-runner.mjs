/** Opt-in loopback-only HTTP agent decision adapter. No fallback/fake decisions. */
import {writeFileSync} from 'node:fs';
import {createMatch,decision,observe,recordTurn,verifyMatch,standings} from './league.mjs';

export function requireLocalEndpoint(endpoint) {
  let url;
  try {url=new URL(endpoint);}catch {throw Error('Invalid endpoint URL');}
  if (url.protocol!=='http:' || !['127.0.0.1','[::1]'].includes(url.hostname) ||
      url.username || url.password || url.hash || !url.port) throw Error('Endpoint must be an explicit loopback HTTP port');
  return url.href;
}
export async function playWithLocalAgent({endpoint,rounds=4,seed=42,roster,timeoutMs=8000}={}) {
  const url=requireLocalEndpoint(endpoint);
  if (!Number.isInteger(rounds)||rounds<1||rounds>50)throw Error('1-50 rounds required');
  if (!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('Invalid timeout');
  const match=createMatch({seed,roster});
  for (let turn=1;turn<=rounds;turn++) {
    const submissions=[];
    for(const agent_id of match.roster) {
      const observation=observe(match.final,agent_id);
      const response=await fetch(url,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({schema:'evercraft.founders-arena.request.v1',observation}),
      });
      if(!response.ok)throw Error(`Agent provider returned HTTP ${response.status} on turn ${turn}`);
      const body=await response.text();
      if(body.length>2048)throw Error('Agent response exceeded max size');
      let answer;try{answer=JSON.parse(body)}catch{throw Error('Agent returned invalid JSON')}
      if (!answer || typeof answer!=='object'||Array.isArray(answer)||
          typeof answer.action!=='string' || Object.keys(answer).some(k=>!['action','target_id'].includes(k)))
        throw Error('Agent response must be {action,target_id?}');
      submissions.push(decision(turn,agent_id,answer.action,answer.target_id??null));
    }
    // An invalid/missing response causes the match to stop, never synthetic fallback.
    recordTurn(match,submissions);
  }
  verifyMatch(match);
  return match;
}
if (process.argv[1]?.endsWith('/local-agent-runner.mjs')) {
  try {
    const endpoint=process.argv[2];
    const rounds=Number(process.argv[3]??4);
    const target=process.argv[4]??'founders-arena-agent-match.json';
    const match=await playWithLocalAgent({endpoint,rounds});
    writeFileSync(target,JSON.stringify(match,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({verified:true,turns:match.turns.length,digest:match.digest,
      standings:standings(match.final),artifact:target},null,2));
  } catch (error) {console.error(error.message);process.exitCode=1;}
}
