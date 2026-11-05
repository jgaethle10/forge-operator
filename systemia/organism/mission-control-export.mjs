#!/usr/bin/env node
// Operator invoked, read-only input: no remote access, dispatch, payment or secrets.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,writeFile} from 'node:fs/promises';
import {readGoalState} from './goal-store.mjs';
import {projectGoalStates} from './mission-control-projection.mjs';

async function main(argv){
 const files=[];let out='';
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--state'&&argv[i+1])files.push(argv[++i]);
  else if(argv[i]==='--out'&&argv[i+1]&&!out)out=argv[++i];
  else throw Error('Usage: node mission-control-export.mjs --state /private/goal.json [--state /private/next.json] --out /private/operator-snapshot.json');
 }
 if(files.length<1||files.length>80||!out)throw Error('An explicit state file and private output path are required.');
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 const output=path.resolve(out);
 const parent=await realpath(path.dirname(output));
 if(parent===root||parent.startsWith(root+path.sep))throw Error('Refusing export into source repository. Use an existing private directory outside the repo.');
 if(files.some(p=>path.resolve(p)===output))throw Error('Refusing to overwrite a goal source.');
 const states=[];
 for(const file of files)states.push(await readGoalState(file));
 const snapshot=projectGoalStates(states);
 await writeFile(output,JSON.stringify(snapshot,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
 process.stdout.write('Local read-only Systemia snapshot written: '+snapshot.missions.length+' goal(s). File remains operator-reported, not authenticated.\n');
}
main(process.argv.slice(2)).catch(err=>{process.stderr.write('MISSION_EXPORT_HELD: '+err.message+'\n');process.exitCode=1;});
