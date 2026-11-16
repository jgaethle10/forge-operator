#!/usr/bin/env node
/**
 * Evercraft Payments | Existing Stripe Payment Link settlement importer.
 * No network by default; --scan GET-only; --commit requires owner authorization.
 */
import os from 'node:os';
import path from 'node:path';
import {readHostedOfferRegistry,reconcileHostedLinks,openHostedSettlementJournal}
  from '../systemia/payments/hosted-link-settlement-bridge.mjs';
import {createRavenStripeHostedReader}
  from '../systemia/raven/stripe-hosted-receipt-reader.mjs';

const args=new Set(process.argv.slice(2));
if(args.has('--help')){
 console.log([
  'Evercraft Payments | existing Stripe Payment Links settlement import',
  '  No arguments: show safety status; NO network traffic.',
  '  --scan: authenticated Stripe GET-only reconciliation dry run.',
  '  --scan --commit: write verified receipts to private local review journal.',
  'Required PRIVATE environment for scanning:',
  '  STRIPE_SECRET_KEY (owner-authorized live key; never paste in chat)',
  '  EVERCRAFT_APPROVED_STRIPE_ACCOUNT_ID (owner-approved exact acct_... ID)',
  'Additional for --commit:',
  '  EVERCRAFT_SETTLEMENT_IMPORT_APPROVED=yes',
  'Optional:',
  '  EVERCRAFT_HOSTED_SETTLEMENT_JOURNAL_PATH',
  '  EVERCRAFT_HOSTED_SCAN_MAX_PAGES (1..100, default 10)',
  'Never creates checkout sessions, charges, refunds, payouts or delivery jobs.'
 ].join('\n'));
 process.exit(0);
}
if(args.size===0){
 console.log(JSON.stringify({schema:'evercraft.payments.hosted-settlement-operator.v1',
   state:'held_no_provider_reads_attempted',safe_next:'--help',
   payments_attempted:0,fulfillment_released:false}));
 process.exit(0);
}
if(!args.has('--scan')||[...args].some(x=>!['--scan','--commit'].includes(x)))
 throw Error('explicit_scan_flag_required');
const commit=args.has('--commit');
if(commit&&process.env.EVERCRAFT_SETTLEMENT_IMPORT_APPROVED!=='yes')
 throw Error('private_receipt_write_requires_explicit_operator_approval');
const pin=process.env.EVERCRAFT_APPROVED_STRIPE_ACCOUNT_ID||'';
if(!/^acct_[A-Za-z0-9]+$/.test(pin))throw Error('exact_stripe_merchant_account_pin_required');
const provider=createRavenStripeHostedReader({secretKey:process.env.STRIPE_SECRET_KEY});
const offers=readHostedOfferRegistry();
const maxPagesPerLink=Number(process.env.EVERCRAFT_HOSTED_SCAN_MAX_PAGES||10);
const journalFile=process.env.EVERCRAFT_HOSTED_SETTLEMENT_JOURNAL_PATH||
 path.join(os.homedir(),'.local/state/evercraft/payments/hosted-provider-settlement.jsonl');
const journal=commit?openHostedSettlementJournal(journalFile):null;
try{
 const result=await reconcileHostedLinks({provider,approvedAccountId:pin,offers,journal,commit,maxPagesPerLink});
 console.log(JSON.stringify(result,null,2));
 if(result.ok===false||!result.exhaustive)process.exitCode=2;
}catch{
 console.error('hosted_reconciliation_held_provider_or_input_failure');
 process.exitCode=1;
}finally{journal?.close();}
