#!/usr/bin/env node
import { collectEbayBrowseListings } from './ebay-browse-collector.mjs';
import { assessListing } from './engine.mjs';

/**
 * One-shot read-only source smoke. Never install this as a resident/heartbeat
 * without separate Systemia admission and provider permissions.
 *
 * Example:
 * EBAY_BROWSE_ACCESS_APPROVED=yes EBAY_BROWSE_PERMISSION_REF=... \
 * EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... EBAY_DESTINATION_ZIP=98901 \
 * node systemia/asset-radar/ebay-smoke-cli.mjs "pokemon holo" "vintage game"
 */
const queries = process.argv.slice(2);
try {
  const output = await collectEbayBrowseListings({
    queries,
    zip: process.env.EBAY_DESTINATION_ZIP,
    client_id: process.env.EBAY_CLIENT_ID,
    client_secret: process.env.EBAY_CLIENT_SECRET,
    access_approved: process.env.EBAY_BROWSE_ACCESS_APPROVED === 'yes',
    permission_ref: process.env.EBAY_BROWSE_PERMISSION_REF,
  });
  const assessments = output.packets.map(packet => assessListing(packet));
  // Browsed asks can never independently be qualified opportunities because
  // this feed has no sold transactions or independent authenticity verification.
  if (assessments.some(entry => entry.status === 'QUALIFIED_FOR_HUMAN_REVIEW')) {
    throw new Error('browse_only_packet_must_never_qualify');
  }
  process.stdout.write(JSON.stringify({
    schema: 'evercraft.asset-radar.source-smoke.v1',
    provider: output.provider,
    created_at: output.created_at,
    listing_count: output.packet_count,
    status: 'LISTING_DISCOVERY_ONLY',
    observations: output.packets,
    assessments,
    diagnostics: output.diagnostics,
    authorized_comps: 0,
    verified_buy_opportunities: 0,
    external_actions_taken: false,
  }, null, 2) + '\n');
} catch (error) {
  // Do not log HTTP request headers, OAuth bodies, tokens or credentials.
  const permitted = [
    'ebay_browse_permission_not_verified', 'ebay_application_credentials_missing',
    'invalid_shipping_zip', 'invalid_or_excessive_queries',
    'source_access_denied', 'source_rate_limited', 'source_unavailable',
    'source_malformed_json', 'ebay_application_token_invalid',
    'browse_only_packet_must_never_qualify',
  ];
  const code = permitted.includes(error?.message) ? error.message : 'smoke_unavailable';
  process.stderr.write('asset-radar smoke: ' + code + '\n');
  process.exitCode = 1;
}
