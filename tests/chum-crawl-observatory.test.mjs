import assert from 'node:assert/strict';
import {
  buildCrawlOffensePlan,
  classifyCrawler,
  crawlObservationSummary,
  emptyCrawlObservationState,
  recordCrawlerObservation,
} from '../systemia/chum/crawl-observatory.mjs';

assert.equal(classifyCrawler('Mozilla/5.0 compatible; OAI-SearchBot/1.0').family, 'openai-search');
assert.equal(classifyCrawler('ChatGPT-User/1.0').family, 'openai-chatgpt-user');
assert.equal(classifyCrawler('Claude-SearchBot/1.0').family, 'anthropic-claude-search');
assert.equal(classifyCrawler('Mozilla/5.0 Applebot-Extended/1.0').family, 'apple-extended');
assert.equal(classifyCrawler('Mozilla/5.0 normal browser').claimed_crawler, false);

let state = emptyCrawlObservationState();
let recorded = recordCrawlerObservation(state, {
  pathname: '/chum/answers/doors/ev-site/',
  userAgent: 'OAI-SearchBot/1.0',
  method: 'GET',
  status: 200,
  at: '2026-09-25T20:00:00.000Z',
});
assert.equal(recorded.recorded, true);
assert.equal(recorded.family, 'openai-search');
state = recorded.state;

recorded = recordCrawlerObservation(state, {
  pathname: '/forensiscope/editorial/video-too-large-for-chatgpt/',
  userAgent: 'ClaudeBot/1.0',
  method: 'HEAD',
  status: 200,
  at: '2026-09-25T20:05:00.000Z',
});
assert.equal(recorded.recorded, true);
assert.equal(recorded.surface_class, 'forensiscope');
state = recorded.state;

const ignored = recordCrawlerObservation(state, {
  pathname: '/chum/answers/doors/ev-site/',
  userAgent: 'Mozilla/5.0 normal browser',
  method: 'GET',
  status: 200,
});
assert.equal(ignored.recorded, false);

const summary = crawlObservationSummary(state);
assert.equal(summary.total_claimed_crawler_hits, 2);
assert.equal(summary.claimed_crawler_family_count, 2);
assert.equal(summary.observed_path_count, 2);
assert.equal(summary.privacy.ip_addresses_persisted, false);
assert.equal(summary.privacy.raw_user_agents_persisted, false);

const crawlState = {
  schema: 'evercraft.chum.crawl-state.v1',
  entries: {
    '/chum/answers/doors/ev-site/': {
      path: '/chum/answers/doors/ev-site/',
      priority: 100,
      last_changed: '2026-09-25T19:50:00.000Z',
      content_sha256: 'a',
      last_indexnow_sha256: 'a',
    },
    '/chum/capabilities/missed/': {
      path: '/chum/capabilities/missed/',
      priority: 96,
      last_changed: '2026-09-24T18:00:00.000Z',
      content_sha256: 'b',
      last_indexnow_sha256: 'old-b',
    },
  },
};

const plan = buildCrawlOffensePlan({
  crawlState,
  observationState: state,
  now: '2026-09-25T20:10:00.000Z',
  maxTargets: 10,
});

assert.equal(plan.schema, 'evercraft.chum.crawl-offense-plan.v1');
assert.equal(plan.targets[0].path, '/chum/capabilities/missed/');
assert.ok(plan.targets[0].reasons.includes('no_claimed_crawler_hit_after_change'));
assert.ok(plan.targets[0].reasons.includes('post_change_pickup_gap_24h'));
assert.ok(plan.targets[0].reasons.includes('indexnow_pending'));

const observed = plan.targets.find((row) => row.path === '/chum/answers/doors/ev-site/');
assert.ok(observed.reasons.includes('claimed_crawler_hit_after_change_observed'));
assert.equal(observed.evidence_state, 'user_agent_claim_unverified');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.chum.sonar-proof.v1',
  claimed_crawler_hits: summary.total_claimed_crawler_hits,
  offense_targets: plan.target_count,
  top_target: plan.targets[0].path,
  privacy_safe: true,
  truth_boundary_preserved: true,
}, null, 2));
