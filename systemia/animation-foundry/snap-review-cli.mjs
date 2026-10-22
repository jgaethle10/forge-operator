import {readFileSync,writeFileSync} from 'node:fs';
import {evaluateSnapTrace} from './snap-performance-gate.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output){console.error('Usage: node snap-review-cli.mjs INPUT.json OUTPUT.json');process.exit(2)}
try{
 const result=evaluateSnapTrace(JSON.parse(readFileSync(input,'utf8')));
 writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(result.status,result.issues);
 if(result.status!=='KINEMATIC_CANDIDATE')process.exit(10);
}catch(e){console.error('HELD: '+e.message);process.exit(2)}
