import { createAdmissionLedger } from './admission-ledger.mjs';

/* Bounded local execution of explicitly supplied task functions.
   No network, subprocesses, autonomous spawning or external side effects are supplied here.
   A task is provisioned only after its function has been accepted for local execution. */
export async function executeBoundedTasks(tasks,{concurrency=2,onEvent=()=>{}}={}){
  if(!Array.isArray(tasks)||tasks.length>10000)throw new RangeError('invalid_task_batch');
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>256)throw new RangeError('invalid_concurrency');
  if(typeof onEvent!=='function')throw new TypeError('invalid_event_handler');
  const ids=new Set();
  for(const task of tasks){
    if(!task||typeof task.id!=='string'||!task.id.trim()||task.id.length>160||typeof task.run!=='function'||typeof task.verify!=='function'||ids.has(task.id))
      throw new TypeError('invalid_or_duplicate_task');
    ids.add(task.id);
  }
  const ledger=createAdmissionLedger({limit:concurrency});
  const results=new Array(tasks.length);
  for(const task of tasks)ledger.transition(task.id,'requested');
  let next=0;
  const publish=(id,state)=>{const capacity=ledger.transition(id,state);try{onEvent({id,state,capacity});}catch{/* observer failure cannot corrupt execution */}};
  async function worker(){
    while(next<tasks.length){
      const index=next++;
      const task=tasks[index];
      publish(task.id,'admitted');
      publish(task.id,'provisioned');
      publish(task.id,'running');
      try{
        const value=await task.run();
        const accepted=await task.verify(value);
        if(accepted!==true)throw new Error('task_result_not_verified');
        results[index]={id:task.id,ok:true,value};
        publish(task.id,'verified');
      }catch(error){
        results[index]={id:task.id,ok:false,error:String(error?.message||'task_failed').slice(0,200)};
        publish(task.id,'failed');
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},()=>worker()));
  return {results,capacity:ledger.snapshot()};
}
