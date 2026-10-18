#!/usr/bin/env node
/**
 * Evercraft Roman Domain Guardian v1.
 *
 * Read-only DNS/HTTPS observation and failover readiness. It CANNOT steer
 * voteroman.com until an authorized controller routes the original hostname
 * through Evercraft. Never request credentials, login, or call registrar APIs.
 */
import * as dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = Object.freeze({
  original: 'https://voteroman.com/',
  www: 'https://www.voteroman.com/',
  evercraft: 'https://fabric.systemiacommandcenters.com/campaigns/roman/',
  backup: 'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/',
  donation: 'https://donate.voteroman.com/',
});
const CANDIDATE = 'Roman Kilinkaridis';
const DONATION = 'https://donate.voteroman.com/';

async function dnsLookup(name, method, resolver) {
  try {
    const values = await resolver[method](name);
    return { state: 'observed', values: values.map(String).sort() };
  } catch (error) {
    return { state: 'unavailable', values: [], code: String(error?.code || 'dns_failed') };
  }
}

async function getPage(name, url, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'text/html',
        'user-agent': 'Evercraft-Roman-Domain-Guardian/1.0 (+read-only-public-health)',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    const body = length > 1024 * 1024 ? '' : await response.text();
    const candidate = body.includes(CANDIDATE);
    const donationLink = body.includes(DONATION);
    const campaignValid = response.status === 200 &&
      contentType.includes('text/html') && candidate &&
      (name === 'donation' || donationLink) &&
      !body.includes('[APP UNAVAILABLE]');
    return {
      state: 'observed',
      status: response.status,
      effective_url: response.url || url,
      candidate_marker: candidate,
      donation_link_marker: donationLink,
      campaign_valid: campaignValid,
      evercraft_source_header: response.headers.get('x-evercraft-campaign-source') || '',
      content_type: contentType,
    };
  } catch (error) {
    return {
      state: 'network_error',
      status: null,
      campaign_valid: false,
      error_code: String(error?.name || 'fetch_failed').slice(0,50),
    };
  }
}

export function evaluateContinuity({ pages, dnsRecords, observedAt }) {
  const root = pages.original || {};
  const owned = pages.evercraft || {};
  const backup = pages.backup || {};
  const donate = pages.donation || {};
  const www = pages.www || {};

  const ownedReady = owned.campaign_valid === true &&
    owned.evercraft_source_header === 'owned-fabric-static';
  const backupReady = backup.campaign_valid === true;
  const rootShowsEvercraft = root.campaign_valid === true &&
    root.evercraft_source_header === 'owned-fabric-static';
  const rootServesCampaign = root.campaign_valid === true;
  const brokenOrigin = root.status === 402 || root.status === 404 || root.status === 503;
  const fallbackUrl = ownedReady ? TARGETS.evercraft : backupReady ? TARGETS.backup : null;
  let state = 'ORIGINAL_DOMAIN_UNVERIFIED';
  if (rootShowsEvercraft) state = 'ORIGINAL_DOMAIN_VERIFIED_ON_EVERCRAFT';
  else if (rootServesCampaign) state = 'ORIGINAL_DOMAIN_CAMPAIGN_LIVE_HOST_NOT_VERIFIED';
  else if (brokenOrigin) state = 'ORIGINAL_DOMAIN_BROKEN_ROUTING_BLOCKED';
  else if (root.state === 'network_error') state = 'ORIGINAL_DOMAIN_UNREACHABLE';

  return {
    schema: 'evercraft.roman-domain-guardian.v1',
    observed_at: observedAt,
    state,
    original_domain_returns_campaign: rootServesCampaign,
    original_domain_verified_on_evercraft: rootShowsEvercraft,
    original_domain_http_status: root.status ?? null,
    www_http_status: www.status ?? null,
    evercraft_mirror_healthy: ownedReady,
    independent_backup_healthy: backupReady,
    donation_page_healthy: donate.campaign_valid === true,
    external_checkout_transaction_tested: false,
    recommended_public_fallback: fallbackUrl,
    domain_routing_authority: 'not_connected',
    autonomous_original_domain_cutover_performed: false,
    autonomous_dns_write_enabled: false,
    automatic_original_domain_failover_active: rootShowsEvercraft,
    next_step: rootShowsEvercraft
      ? 'KEEP_EVERCRAFT_EDGE_AND_BACKUP_HEALTHY'
      : fallbackUrl
        ? 'AUTHORIZED_ORIGINAL_DOMAIN_DNS_OR_HOSTING_CUTOVER_REQUIRED'
        : 'RECOVER_INDEPENDENT_PUBLIC_HOSTING_BEFORE_CUTOVER',
    dns_public_observations: dnsRecords,
    site_public_observations: pages,
    restrictions: {
      no_registrar_api_calls: true,
      no_login_otp: true,
      no_outreach: true,
      no_new_payment_processing: true,
      no_unauthorized_domain_changes: true,
    },
  };
}

export async function probeGuardian({
  fetchImpl = fetch,
  resolver = dns,
  observedAt = new Date().toISOString(),
  timeoutMs = 9000,
} = {}) {
  const [results, ns, apex, wwwCname, donationCname] = await Promise.all([
    Promise.allSettled(
      Object.entries(TARGETS).map(async ([name, url]) => [
        name,
        await getPage(name, url, fetchImpl, timeoutMs),
      ])
    ),
    dnsLookup('voteroman.com', 'resolveNs', resolver),
    dnsLookup('voteroman.com', 'resolve4', resolver),
    dnsLookup('www.voteroman.com', 'resolveCname', resolver),
    dnsLookup('donate.voteroman.com', 'resolveCname', resolver),
  ]);
  const pages = Object.fromEntries(results.map((result, i) => (
    result.status === 'fulfilled' ? result.value :
    [Object.keys(TARGETS)[i], { state: 'network_error', status: null, campaign_valid: false }]
  )));
  return evaluateContinuity({
    pages,
    dnsRecords: {
      apex_nameservers: ns,
      apex_ipv4: apex,
      www_cname: wwwCname,
      donation_cname: donationCname,
    },
    observedAt,
  });
}

export function markdownSummary(result) {
  const ok = (value) => value === true ? 'PASS' : 'NOT VERIFIED';
  return [
    '## Roman domain guardian: ' + result.state,
    '- Original domain HTTP: ' + (result.original_domain_http_status ?? 'unavailable'),
    '- Original domain on Evercraft: ' + ok(result.original_domain_verified_on_evercraft),
    '- Independent Evercraft mirror: ' + ok(result.evercraft_mirror_healthy),
    '- Wix informational backup: ' + ok(result.independent_backup_healthy),
    '- Donation webpage: ' + ok(result.donation_page_healthy),
    '- Donation checkout transaction tested: NO',
    '- Current public backup: ' + (result.recommended_public_fallback || 'none'),
    '- Next action: ' + result.next_step,
    '- DNS write authority: NOT CONNECTED; no automatic redirect performed',
    '- No user logins, account access, emails, or DNS changes were attempted.',
    '',
  ].join('\n');
}

async function main() {
  // Stop network checks after the election without contacting anyone.
  // Workflow schedules must still be explicitly retired after this date.
  const now = new Date();
  if (now.toISOString().slice(0,10) > '2026-11-04') {
    process.stdout.write('Election-period public checks ended; disable scheduled workflow.\n');
    return;
  }
  const result = await probeGuardian();
  const args = process.argv.slice(2);
  const getArg = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const receipt = getArg('--receipt');
  const summary = getArg('--summary') || process.env.GITHUB_STEP_SUMMARY || null;
  if (receipt) {
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n');
  }
  if (summary) fs.appendFileSync(summary, markdownSummary(result));
  process.stdout.write(markdownSummary(result));
  if (!result.evercraft_mirror_healthy && !result.independent_backup_healthy) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
