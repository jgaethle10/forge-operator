import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('public/kennedy-space-station/index.html','utf8');
const studio = fs.readFileSync('public/kennedy-space-station/studio/index.html','utf8');

test('Kennedy public home launches actual local studio', () => {
  assert.match(home, /kennedy-space-station-workshop-v2-20261120/);
  assert.match(home, /href="studio\/"/);
  assert.match(home, /Launch Kennedy Drawing Studio/);
  assert.match(home, /No sign-in\. No payment\./);
  assert.match(home, /not a construction design service/i);
  assert.doesNotMatch(home, /base44[.]app|checkout[.]stripe|buy[.]stripe/i);
});

test('Kennedy studio has responsive drawing tools and reversible placements', () => {
  assert.match(studio, /id="drawing-1"/);
  assert.match(studio, /id="drawing-2"/);
  for (const tool of ['charger','pad','route','access','note','erase','calibrate']) {
    assert.ok(studio.includes('data-tool="' + tool + '"'), tool);
  }
  assert.match(studio, /id="undo"/);
  assert.match(studio, /id="reset"/);
  assert.match(studio, /id="mobileTools"/);
  assert.match(studio, /id="mobileZoom"/);
  assert.match(studio, /data-mobile-tool="charger"/);
  assert.match(studio, /window[.]print/);
  assert.match(studio, /id="export"/);
  assert.match(studio, /id="evidence"/);
  assert.match(studio, /id="draftSave"/);
  assert.match(studio, /id="draftLoad"/);
  assert.match(studio, /href="[.][.]\/"/);
});

test('Kennedy studio is a truthful concept tool with browser-local images', () => {
  assert.match(studio, /CONCEPT WORKSPACE|LOCAL IN YOUR BROWSER/);
  assert.match(studio, /NOT FOR CONSTRUCTION/);
  assert.match(studio, /NOT A SURVEY|not a survey/i);
  assert.match(studio, /engineering_approved:false/);
  assert.match(studio, /payment_verified:false/);
  assert.match(studio, /image\/png,image\/jpeg,image\/webp/);
  assert.match(studio, /source_binding/);
  assert.match(studio, /crypto[.]subtle[.]digest/);
  assert.doesNotMatch(studio, /<script[^>]+src=|<iframe|fetch\(|XMLHttpRequest|sendBeacon|base44[.]app/);
});
