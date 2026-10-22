#!/usr/bin/env node
/**
 * Evercraft-owned website commerce release hold.
 * Deprecated hosted applications are not permissible buyer acceptance targets.
 * No browser or network calls are made. Historic Stripe/form observations
 * cannot authorize a current checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
const receipt={
 schema:'evercraft.website-commerce.browser-acceptance.v1',
 checked_at:new Date().toISOString(),
 origin:null,
 engine:'owned_source_only_release_hold',
 read_only:true,
 customer_data_submitted:false,
 payment_attempted:false,
 legacy_provider_requests:0,
 provider_checkout_attempts:0,
 observed:[],
 blockers:[
  'legacy_website_checkout_provider_frozen',
  'owned_buyer_site_route_not_verified',
  'independently_verified_payment_to_shipping_contract_required'
 ],
 buyer_ready:false,
 public_promotion_authorized:false,
 note:'All historical form and Stripe checkout observations are archival. Never claim a public sale, paid receipt, settlement or fulfillment.'
};
const output=path.resolve(process.env.EVERCRAFT_CHECKOUT_RECEIPT||'artifacts/website-commerce-acceptance.receipt.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(process.argv.includes('--gate'))process.exitCode=1;
