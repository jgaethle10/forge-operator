// Render an additive patch only against the exact deployed runner blob.
// stdout is candidate source, never a write to a live release.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const expectedRunnerBlob='0f2a8f736ade8a513f51e0483e2d8b3d88cf9f8c';
export function patchExactRunner(source){
 const bytes=Buffer.isBuffer(source)?source:Buffer.from(source);
 const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(blob!==expectedRunnerBlob)throw Error('gmail_overlay_runner_blob_mismatch');
 let s=bytes.toString('utf8');
 function replace(a,b){if(s.split(a).length!==2)throw Error('gmail_overlay_anchor_mismatch');s=s.replace(a,b)}
 replace("import {runFindMyPartCycle} from './kaidance-findmypart-execution.mjs';","import {runFindMyPartCycle} from './kaidance-findmypart-execution.mjs';\nimport {runResidentGmailTick} from '../revenue-desk/kaidance-gmail-resident-tick.mjs';");
 replace('forestReceipt=null,findmypartExecutionReceipt=null','forestReceipt=null,findmypartExecutionReceipt=null,gmailResidentPulse=null');
 replace('const report={...planned.report,proof,event_discovery:',"const report={...planned.report,proof,gmail_resident:gmailResidentPulse||{status:'not_admitted',send_authority:false,contact_clearance:false,quota_authority:false},event_discovery:");
 replace('  const result=runCompanyHeartbeat({outDir,now:at,findmypartExecutionReceipt,',"  const gmailResidentPulse=runResidentGmailTick({enabled:process.env.SYSTEMIA_REVENUE_GMAIL_REFRESH_ENABLED==='true',githubActions:process.env.GITHUB_ACTIONS==='true',outDir,tickAt:at,expectedMailbox:process.env.SYSTEMIA_REVENUE_GMAIL_EXPECTED_MAILBOX});\n  const result=runCompanyHeartbeat({outDir,now:at,findmypartExecutionReceipt,gmailResidentPulse,");
 replace('   findmypart_commercial_status:result.report?.findmypart?.commercial_status||null,','   findmypart_commercial_status:result.report?.findmypart?.commercial_status||null,\n   gmail_resident_status:result.report?.gmail_resident?.status||null,');
 return s;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)throw Error('gmail_overlay_usage');process.stdout.write(patchExactRunner(fs.readFileSync(process.argv[2])))}
 catch{console.error('GMAIL_EXACT_RUNNER_OVERLAY_HELD');process.exitCode=1}
}
