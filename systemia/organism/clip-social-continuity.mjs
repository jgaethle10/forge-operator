import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const APP_ID = process.env.EVERCRAFT_CLIP_APP_ID || '6a83af980c9f995f588c7df3';
const BASE = process.env.EVERCRAFT_CLIP_FUNCTION_BASE || `https://base44.app/api/apps/${APP_ID}/functions`;
const HAVENLY_PAGE_ID = '924929507380565';
const RNB_PAGE_ID = '116675248108887';
const EXPECTED_STORY_BUILD = 'CLIP-AUTOPUBLISH-2026-09-29-CONTINUITY-RECOVERY-V4';

async function post(name, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(`${BASE}/${name}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return {name, ok: response.ok, status: response.status, started_at: startedAt, completed_at: new Date().toISOString(), body};
  } catch (error) {
    return {name, ok: false, status: 0, started_at: startedAt, completed_at: new Date().toISOString(), error: String(error?.message || error), body: {}};
  } finally {
    clearTimeout(timer);
  }
}

function compactIncident(result) {
  return {
    page_id: result?.page_id || null,
    page_name: result?.page_name || null,
    state: result?.state || null,
    reason: result?.reason || null,
    ready: Number(result?.ready || 0),
    held: Number(result?.held || 0),
    published_last_24h: Number(result?.published_last_24h || 0),
    cap: Number(result?.cap || 0)
  };
}

export async function run() {
  const startedAt = new Date().toISOString();
  const publisher = await post('publishUnifiedSocialQueue', 280000);
  const watchdog = await post('publishingContinuityWatchdog', 90000);

  const lanes = Array.isArray(publisher?.body?.lanes) ? publisher.body.lanes : [];
  const storyLane = lanes.find((lane) => lane?.lane === 'facebook_story') || null;
  const storyPolicy = storyLane?.policy || null;
  const storySkips = Array.isArray(storyLane?.skipped) ? storyLane.skipped : [];
  const blockedLanes = lanes.filter((lane) => lane?.ok === false).map((lane) => ({
    lane: lane?.lane || null,
    platform: lane?.platform || null,
    http_status: lane?.http_status || 0,
    error: lane?.error || null
  }));

  const havenlyHardExcluded = storySkips.some((row) =>
    String(row?.pageId || row?.page_id || '') === HAVENLY_PAGE_ID && row?.reason === 'hard_exclusion'
  );
  const hardExcludedIds = Array.isArray(storyPolicy?.hardExcludedPageIds) ? storyPolicy.hardExcludedPageIds.map(String) : [];
  const exclusionPolicyVerified =
    hardExcludedIds.length === 1 &&
    hardExcludedIds[0] === RNB_PAGE_ID &&
    !hardExcludedIds.includes(HAVENLY_PAGE_ID);
  const runtimeBuildVerified = storyPolicy?.runtimeBuildId === EXPECTED_STORY_BUILD;

  const results = Array.isArray(watchdog?.body?.results) ? watchdog.body.results : [];
  const incidents = results.filter((row) => row?.state === 'incident').map(compactIncident);
  const degraded = results.filter((row) => row?.state === 'degraded').map(compactIncident);

  const hardFailures = [];
  if (!publisher.ok) hardFailures.push('unified_publisher_http_failure');
  if (publisher?.body?.ok === false) hardFailures.push('unified_publisher_blocked_lane');
  if (!watchdog.ok || watchdog?.body?.ok === false) hardFailures.push('continuity_watchdog_http_failure');
  if (!storyPolicy) hardFailures.push('story_policy_receipt_missing');
  if (storyPolicy && !runtimeBuildVerified) hardFailures.push('stale_story_runtime_build');
  if (storyPolicy && !exclusionPolicyVerified) hardFailures.push('publishing_exclusion_policy_mismatch');
  if (havenlyHardExcluded) hardFailures.push('havenly_stale_hard_exclusion');
  if (blockedLanes.length) hardFailures.push('blocked_publish_lane');
  if (incidents.length) hardFailures.push('active_publishing_continuity_incident');

  const status = hardFailures.length ? 'incident' : degraded.length ? 'degraded' : 'healthy';
  const receipt = {
    schema: 'systemia.clip-social-continuity.v1',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status,
    hard_failures: [...new Set(hardFailures)],
    policy: {
      expected_story_build: EXPECTED_STORY_BUILD,
      observed_story_build: storyPolicy?.runtimeBuildId || null,
      exclusion_policy_verified: exclusionPolicyVerified,
      hard_excluded_page_ids: hardExcludedIds,
      rnb_must_remain_excluded: RNB_PAGE_ID,
      havenly_must_not_be_excluded: HAVENLY_PAGE_ID
    },
    publisher: {
      http_status: publisher.status,
      ok: publisher.ok && publisher?.body?.ok !== false,
      published_count: Number(publisher?.body?.published_count || 0),
      staged_count: Number(publisher?.body?.staged_count || 0),
      blocked_lanes: blockedLanes,
      replenishment: publisher?.body?.replenishment || null,
      cross_platform_stage: publisher?.body?.cross_platform_stage || null
    },
    watchdog: {
      http_status: watchdog.status,
      version: watchdog?.body?.watchdog_version || null,
      page_count: Number(watchdog?.body?.pages || 0),
      incidents,
      degraded
    }
  };
  const canonical = JSON.stringify(receipt);
  receipt.receipt_sha256 = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;

  const path = process.env.CLIP_CONTINUITY_RECEIPT_PATH;
  if (path) {
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(receipt, null, 2));
  if (status === 'incident') process.exitCode = 1;
  return receipt;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
