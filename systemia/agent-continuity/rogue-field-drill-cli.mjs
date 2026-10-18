#!/usr/bin/env node
import {runRogueAgentMission} from './rogue-field-drill.mjs';
const result=await runRogueAgentMission();
if(result.result!=='PASSED_CONTAINED_LOCAL_ROGUE_DRILL_NOT_PRODUCTION'||
 result.observed_rogue_process_terminated!==true||
 result.spider_society_local_adapter.runnable_retries!==0||
 result.operator_production_admission_verified!==false)
 throw Error('ROGUE_AGENT_MISSION_HELD: acceptance evidence absent');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
