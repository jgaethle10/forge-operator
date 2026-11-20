// Public-only AAAR / FindMyPart source-evidence tests.
// A single repo-level command runs the three narrowly scoped suites.
// node --test tests/aaar-legacy-memory.test.mjs
// Does not fetch external sources, contact vendors, buy or evaluate defense equipment.
import '../research/aaar/legacy-memory/supplier-preflight.test.mjs';
import '../research/aaar/legacy-memory/source-conflict-review.test.mjs';
import '../research/aaar/legacy-memory/civilian-cnc-memory-check.test.mjs';
import './aaar-legacy-memory-surface.test.mjs';
