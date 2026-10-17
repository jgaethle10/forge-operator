#!/usr/bin/env node
// Read-only live GitHub schedule cohort observation. Never dispatch repairs or
// claim an owned agent/provider side effect. A successful CI job only certifies
// that the diagnostic emitted a truthful bounded provider-readback artifact.
import {observeScheduledCohort} from './github-schedule-cohort.mjs';
const receipt=await observeScheduledCohort({
 repo:process.env.GITHUB_REPOSITORY,
 token:process.env.GITHUB_TOKEN
});
if(receipt.source_execution_authority!=='NONE_READ_ONLY'||receipt.common_cause_verified!==false||
 receipt.actual_agent_telemetry_verified!==false||receipt.service_recovery_verified!==false)
 throw Error('Cohort read-only acceptance contract violated');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
