/**
 * Sandbox JSONL bridge. Reads one input command per line on stdin and writes one
 * JSON response per line. The calling agent supplies ALL valid decisions.
 * No network requests, tool access, subprocesses, or production mutations.
 * A caller must keep the opaque match receipt if it wants replay proof.
 */
import { createInterface } from 'node:readline';
import {createMatch,observe,recordTurn,verifyMatch,standings} from './league.mjs';
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
let match=null;
for await(const line of rl) {
  if (!line.trim()) continue;
  try {
    if (line.length>20000) throw Error('Request too large');
    const msg=JSON.parse(line);
    let result;
    if (msg.command==='new') {
      match=createMatch({seed:msg.seed??42,roster:msg.roster});
      result={turn:0,roster:match.roster};
    } else if (msg.command==='observe') {
      if(!match)throw Error('Start a match first');
      result=observe(match.final,msg.agent_id);
    } else if (msg.command==='advance') {
      if(!match)throw Error('Start a match first');
      recordTurn(match,msg.decisions);
      result={turn:match.final.turn,weather:match.final.weather,standings:standings(match.final),
        receipt_digest:match.digest};
    } else if (msg.command==='receipt') {
      if(!match)throw Error('Start a match first');
      result={verified:verifyMatch(match),match};
    } else throw Error('Unknown command');
    process.stdout.write(JSON.stringify({ok:true,result})+'\n');
  } catch(err) {
    process.stdout.write(JSON.stringify({ok:false,error:err.message})+'\n');
  }
}
