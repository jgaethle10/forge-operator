import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/forensiscope/index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/evercraft-journal-pages.yml',import.meta.url),'utf8');

test('ForensiScope fallback is one mobile-first action with transparent purchase state',()=>{
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/Long recording\?/);
  assert.equal((html.match(/class="action"/g)||[]).length,1);
  assert.match(html,/>Request a review</);
  assert.match(html,/mailto:jessegaethle10@gmail.com/);
  assert.match(html,/Approximate%20recording%20length/);
  assert.match(html,/What%20I%20want%20to%20find/);
  assert.match(html,/I%20have%20permission%20to%20share/);
  assert.match(html,/No charge now/);
  assert.match(html,/Don't send the file yet/);
  assert.match(html,/Evercraft Payments/);
  assert.doesNotMatch(html,/base44\.app|buy\.stripe|checkout\.stripe/i);
  assert.doesNotMatch(html,/<form|type="file"|<script/i);
});
test('ForensiScope static fallback exactly displays existing published prices',()=>{
  for(const [label,price] of [
    ['Up to 5 minutes',15],['Up to 30 minutes',35],['Up to 2 hours',75],
    ['Up to 6 hours',149],['Up to 12 hours',249]
  ]) {
    assert.ok(html.includes(label),label);
    assert.ok(html.includes('<b>$'+price+'</b>'),String(price));
  }
  assert.equal((html.match(/<li><span>Up to/g)||[]).length,5);
});
test('Pages build and deploy require source and live HTTP verification',()=>{
  assert.match(workflow,/test -s _public_pages\/forensiscope\/index.html/);
  assert.match(workflow,/Verify ForensiScope fallback buyer page over deployed HTTPS/);
  assert.match(workflow,/FORENSISCOPE_SIMPLE_PUBLIC_BUYER_HTTP_VERIFIED/);
});
