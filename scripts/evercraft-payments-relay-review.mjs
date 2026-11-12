#!/usr/bin/env node
/**
 * Optional private owner Relay review notification sender.
 * No args => no private files, no notification or network activity.
 * --plan => read private journal and print safe counts.
 * --send => require separate explicit owner approval + Relay secret.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readHostedOfferRegistry} from '../systemia/payments/hosted-link-settlement-bridge.mjs';
import {planHostedPaymentRelayAlerts,dispatchHostedPaymentRelayAlerts} from
  '../systemia/payments/hosted-relay-review.mjs';
import {createNotificationClient} from '../systemia/notification-fabric/client.mjs';

const action=process.argv.slice(2);
if(action.length===0){
 console.log(JSON.stringify({schema:'evercraft.payments.relay-review-operator.v1',
   state:'held_no_owner_action',network_requests:0,notifications_sent:0,
   next:'--plan'}));
 process.exit(0);
}
if(action.length!==1||!['--plan','--send'].includes(action[0]))
 throw Error('explicit_payment_review_action_required');
const send=action[0]==='--send';
if(send&&process.env.EVERCRAFT_PAYMENTS_RELAY_SEND_APPROVED!=='yes')
 throw Error('explicit_relay_delivery_approval_required');
const accountId=process.env.EVERCRAFT_APPROVED_STRIPE_ACCOUNT_ID||'';
const recipientId=process.env.EVERCRAFT_PAYMENTS_REVIEW_OWNER_PRINCIPAL||'';
const journalPath=process.env.EVERCRAFT_HOSTED_SETTLEMENT_JOURNAL_PATH||
 path.join(os.homedir(),'.local/state/evercraft/payments/hosted-provider-settlement.jsonl');
const source=fs.readFileSync(journalPath,'utf8');
const plan=planHostedPaymentRelayAlerts({journalText:source,approvedAccountId:accountId,
  offers:readHostedOfferRegistry(),recipientId});
if(!send){
 console.log(JSON.stringify({schema:'evercraft.payments.relay-review-operator.v1',
   state:'planned_no_notification_sent',count:plan.count,
   payment_review_count:plan.paid_review_count,reversal_review_count:plan.reversal_review_count,
   network_requests:0,notifications_sent:0}));
 process.exit(0);
}
const client=createNotificationClient({
 baseUrl:process.env.EVERCRAFT_NOTIFICATION_BASE_URL,
 token:process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN
});
const r=await dispatchHostedPaymentRelayAlerts({plan,client,explicitOwnerApproval:true});
console.log(JSON.stringify({schema:'evercraft.payments.relay-review-operator.v1',...r}));
