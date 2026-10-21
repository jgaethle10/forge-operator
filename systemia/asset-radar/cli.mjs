#!/usr/bin/env node
import fs from 'node:fs';
import { assessListing, newReviewAlerts } from './engine.mjs';

// For permissioned, manually collected observation packets only. No live scraping.
const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
  process.stderr.write('usage: node systemia/asset-radar/cli.mjs <observations.json>\n');
  process.exitCode = 2;
} else {
  try {
    const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    if (!Array.isArray(document.listings)) throw new Error('expected listings array');
    const now = document.as_of ? new Date(document.as_of) : new Date();
    const reports = document.listings.map(raw => assessListing(raw, { now }));
    const { alerts } = newReviewAlerts(reports, document.previously_alerted_keys || []);
    const result = {
      schema: 'evercraft.asset-radar.review-batch.v1',
      evaluated_at: now.toISOString(),
      listing_count: reports.length,
      review_count: alerts.length,
      assessments: reports,
      alerts,
      external_action_taken: false,
      live_source_poll_performed: false,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`asset radar assessment failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
