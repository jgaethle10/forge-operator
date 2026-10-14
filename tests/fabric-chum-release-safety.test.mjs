import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// This is a production release interlock, not a cosmetic lint rule.
// Fabric's resident updater follows main; a sitemap-only release can
// inadvertently run destructive checkout cleanup against Journal receipts.
test('Fabric release cannot silently discard Journal publication evidence', () => {
  const source = fs.readFileSync('scripts/update-fabric-owned-edge.sh', 'utf8');
  const sourceLines = source.split('\n');
  const destructive = sourceLines
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text }) =>
      !text.startsWith('#') &&
      /\bgit\b/.test(text) &&
      /\b(?:clean\b[^#\n]*|restore\b[^#\n]*)\s+--\s+public\/journal(?:\s|$)/.test(text)
    );
  assert.equal(
    destructive.length,
    0,
    'RELEASE HOLD: updater can clean/restore public/journal without preserving evidence at lines ' +
      destructive.map(x => x.line).join(', ') +
      '. Merge and verify Journal-preservation repair before any Fabric production release.'
  );
});
