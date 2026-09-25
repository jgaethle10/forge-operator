import assert from 'node:assert/strict';
import { extractCandidateLinks, newCandidateLinks } from './legacy-rescue-link-discovery.mjs';

const source = {
  url:'https://example.gov/vendor/',
  allowed_hosts:['example.gov'],
  link_match_terms:['modernization','legacy','mainframe','rfp'],
};
const links = extractCandidateLinks(`
  <a href="/rfp/mainframe-modernization">Mainframe Modernization RFP</a>
  <a href="/news/picnic">Summer picnic</a>
  <a href="https://evil.test/legacy-rfp">External legacy RFP</a>
  <a href="/legacy-system-replacement?event=44#top">Legacy System Replacement</a>
`, source);
assert.equal(links.length,2);
assert.equal(links[0].url,'https://example.gov/rfp/mainframe-modernization');
assert.equal(links[1].url,'https://example.gov/legacy-system-replacement?event=44');

const added = newCandidateLinks([links[0]], links);
assert.equal(added.length,1);
assert.equal(added[0].title,'Legacy System Replacement');

console.log(JSON.stringify({ok:true,links:links.length,new_links:added.length}));
