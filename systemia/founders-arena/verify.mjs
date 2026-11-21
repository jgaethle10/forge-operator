import {readFileSync} from 'node:fs';
import {verifyMatch,standings} from './league.mjs';
try {
  const path=process.argv[2];
  if (!path) throw Error('Usage: node verify.mjs match.json');
  const match=JSON.parse(readFileSync(path,'utf8'));
  verifyMatch(match);
  console.log(JSON.stringify({verified:true,turns:match.turns.length,digest:match.digest,
    standings:standings(match.final)},null,2));
} catch(err) {console.error(`NOT VERIFIED: ${err.message}`);process.exitCode=1;}
