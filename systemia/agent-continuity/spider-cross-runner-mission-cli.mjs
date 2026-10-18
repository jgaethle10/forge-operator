#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runCrossRunnerSpiderMission} from './spider-cross-runner-mission.mjs';
if(!process.argv[2])throw Error('SPIDER_CROSS_RUNNER_MISSION_HELD: downloaded source mission file required');
const raw=readFileSync(resolve(process.argv[2]),'utf8');
if(Buffer.byteLength(raw)>131072)throw Error('SPIDER_CROSS_RUNNER_MISSION_HELD: input too large');
const result=await runCrossRunnerSpiderMission(JSON.parse(raw));
if(result.status!=='PASSED_TWO_RUNNER_PROVIDER_HANDOFF_AND_RESTARTED_HTTP_SANDBOX_ONLY'||
 result.receiver_service_os_restart_completed!==true||
 result.first_wave.length!==4||result.second_wave_after_restart.length!==4||
 result.real_spider_society_service_called!==false||
 result.global_no_regeneration_proven!==false)
 throw Error('SPIDER_CROSS_RUNNER_MISSION_HELD: invalid acceptance');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
