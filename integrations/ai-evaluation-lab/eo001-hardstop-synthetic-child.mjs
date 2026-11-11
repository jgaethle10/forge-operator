/**
 * EO-001 hard-stop supervisor test fixture ONLY.
 *
 * Never imports Qwen, the sovereign gateway, payment tools or Systemia.
 * The modes deliberately simulate hung and misbehaving child processes.
 */
import {spawn} from 'node:child_process';

const mode=process.argv[2];
const permitted=new Set(['success','crash','stall','ignore-term',
  'late-result','oversize','partial','descendant-stall']);
if(!permitted.has(mode))process.exit(64);

function emit(){
  process.stdout.write(JSON.stringify({
    schema:'evercraft.eo001.synthetic-child.v1',
    mode,result:'FIXTURE_ONLY',model_inference_executed:false
  })+'\n');
}
if(mode==='success')emit();
else if(mode==='crash'){
  process.stdout.write('{"partial":');
  process.exitCode=19;
}else if(mode==='oversize'){
  process.stdout.write('X'.repeat(32768));
}else if(mode==='late-result'){
  setTimeout(emit,800);
}else if(mode==='partial'){
  process.stdout.write('{"incomplete":');
  setInterval(()=>{},1000);
}else if(mode==='descendant-stall'){
  // Inherit stdout so the parent's close event also waits on the grandchild.
  spawn(process.execPath,['-e',
    'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
    {stdio:['ignore','inherit','inherit'],env:{PATH:'/usr/bin:/bin'}});
  process.on('SIGTERM',()=>{});
  setInterval(()=>{},1000);
}else{
  if(mode==='ignore-term')process.on('SIGTERM',()=>{});
  setInterval(()=>{},1000);
}
