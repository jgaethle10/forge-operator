import { writeFileSync } from 'node:fs';
import { createMatch,decision,recordTurn,verifyMatch,standings,observe } from './league.mjs';

// Reproducible synthetic policy match. These are NOT LLM calls.
export function runDemo(rounds=12, seed=42) {
  const match=createMatch({seed});
  const policies={Systemia:['research','expand','cultivate','build','rest'],Forge:['fortify','build','cultivate','research','rest'],
    Mnemosyne:['research','cultivate','expand','research','rest'],Raven:['cultivate','build','fortify','expand','rest']};
  for(let turn=1;turn<=rounds;turn++) {
    const submissions=match.roster.map(id=> {
      const obs=observe(match.final,id);
      return decision(obs.turn,id,policies[id][(turn-1)%policies[id].length]);
    });
    recordTurn(match,submissions);
  }
  verifyMatch(match);
  return match;
}
if (process.argv[1]?.endsWith('/demo.mjs')) {
  const rounds=Number(process.argv[2]??12);
  if (!Number.isInteger(rounds)||rounds<1||rounds>500) throw Error('Rounds must be 1-500');
  const match=runDemo(rounds);
  const file=process.argv[3]??'founders-arena-match.json';
  writeFileSync(file,JSON.stringify(match,null,2)+'\n',{flag:'w'});
  console.log(JSON.stringify({schema:match.schema,turns:match.turns.length,verified:true,receipt_digest:match.digest,
    standings:standings(match.final),artifact:file},null,2));
}
