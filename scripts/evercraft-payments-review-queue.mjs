#!/usr/bin/env node
/**
 * Evercraft Payments -> Systemia reviewer inbox.
 * This is a local-only, review-only proposal generator, NOT a delivery executor.
 */
import os from 'node:os';
import path from 'node:path';
import {readHostedOfferRegistry} from '../systemia/payments/hosted-link-settlement-bridge.mjs';
import {preparePrivateReviewInbox} from '../systemia/payments/hosted-fulfillment-review.mjs';
const args=process.argv.slice(2);
const dataRoot=path.join(os.homedir(),'.local/state/evercraft/payments');
if(args.length===0){
  console.log(JSON.stringify({schema:'evercraft.payments.systemia-review-prep.v1',
    state:'held_no_private_files_accessed',
    action:'none',next:'--prepare-review',fulfillment_jobs_created:0}));
  process.exit(0);
}
if(args.length!==1||args[0]!=='--prepare-review')throw Error('explicit_review_preparation_required');
const approvedAccountId=process.env.EVERCRAFT_APPROVED_STRIPE_ACCOUNT_ID||'';
if(!/^acct_[A-Za-z0-9]+$/.test(approvedAccountId))
  throw Error('approved_merchant_account_required');
const journalPath=process.env.EVERCRAFT_HOSTED_SETTLEMENT_JOURNAL_PATH||
  path.join(dataRoot,'hosted-provider-settlement.jsonl');
const outPath=process.env.EVERCRAFT_SYSTEMIA_REVIEW_INBOX_PATH||
  path.join(dataRoot,'systemia-review-inbox.json');
const result=preparePrivateReviewInbox({
  journalPath,outPath,approvedAccountId,offers:readHostedOfferRegistry()
});
console.log(JSON.stringify({schema:'evercraft.payments.systemia-review-prep.v1',
  state:'prepared_private_proposals_only',...result,
  customer_messages_sent:0,fulfillment_jobs_created:0}));
