#!/usr/bin/env node
// Saban's real lease scheduler executes bounded local adversarial Black Box work.
// The output proves the scheduler/test harness ran, NOT Systemia admission.
import {runSabanBlackBoxReview} from './saban-blackbox-review.mjs';
const receipt=await runSabanBlackBoxReview();
if(receipt.status!=='PASS_SYNTHETIC_REVIEW_ONLY'||
 receipt.scheduler.completed!==8||receipt.scheduler.retried!==1||
 receipt.execution_authority!=='NONE_READ_ONLY'||
 receipt.genuine_passport_enrollment!==false)
 throw Error('SABAN_BLACKBOX_REVIEW_HELD: review receipt assertions failed');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
