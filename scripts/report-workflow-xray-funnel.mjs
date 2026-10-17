#!/usr/bin/env node
/**
 * Read-only, private aggregate report for the resident owned Fabric host.
 * Nothing here calls a provider or ingests buyer personal data.
 *
 * Usage: node scripts/report-workflow-xray-funnel.mjs [--days 7]
 */
import process from 'node:process';
import { DEFAULT_OFFER_FUNNEL_PATH, summarizeOfferFunnel } from '../systemia/mcp/offer-funnel-ledger.mjs';

function arg(key){
 const i=process.argv.indexOf(key);
 return i<0?null:process.argv[i+1];
}
const rawDays=arg('--days');
if(rawDays!==null&&!/^(?:[1-9]|[12][0-9]|3[01])$/.test(rawDays)){
 process.stderr.write('Usage: node scripts/report-workflow-xray-funnel.mjs [--days 1..31]\n');
 process.exit(2);
}
const days=rawDays===null?7:Number(rawDays);
const filePath=process.env.EVERCRAFT_OFFER_FUNNEL_LEDGER_PATH||DEFAULT_OFFER_FUNNEL_PATH;
const report=summarizeOfferFunnel(filePath,{days});
process.stdout.write(JSON.stringify({
 ...report,
 collection_state:report.durable_file_read?'read_only_local_file_observed':'no_local_file_readable',
 interpretation:[
  'Counts are anonymous HTTP requests, not unique visitors or independently attributable people.',
  'Source labels are URL/form claims and can be absent or spoofed.',
  'A checkout_ready observation does not mean Stripe payment, paid receipt, settlement or delivered work.',
  'Production must separately verify payments through Evercraft Payments provider-paid receipts.',
 ],
},null,2)+'\n');
