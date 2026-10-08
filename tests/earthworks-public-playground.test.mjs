import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const canonical=fs.readFileSync('systemia/earthworks-autonomy/fleet-controller.mjs','utf8');
const nativeApp=fs.readFileSync('systemia/mcp/earthworks-simulator-app.mjs','utf8');
const page=fs.readFileSync('public/demos/earthworks-autonomy/index.html','utf8');

function between(source,begin,end){
  const start=source.indexOf(begin);
  assert.notEqual(start,-1,'missing begin marker '+begin);
  const contentStart=start+begin.length;
  const finish=source.indexOf(end,contentStart);
  assert.notEqual(finish,-1,'missing end marker '+end);
  return source.slice(contentStart,finish);
}

test('public EarthWorks playground embeds the canonical fleet controller exactly',()=>{
  const embedded=between(
    page,
    '/* EARTHWORKS_CANONICAL_CONTROLLER_BEGIN */\n',
    '\n/* EARTHWORKS_CANONICAL_CONTROLLER_END */'
  );
  assert.equal(embedded,canonical.replace(/\bexport\s+/g,''));
  assert.match(embedded,/function createFleetController/);
  assert.match(embedded,/currentLoadTruckId/);
  assert.match(embedded,/STOP ALL/);
});

test('public EarthWorks playground embeds the same Live Yard app without module transport dependency',()=>{
  const embeddedApp=between(
    page,
    '/* EARTHWORKS_LIVE_YARD_APP_BEGIN */\n',
    '\n/* EARTHWORKS_LIVE_YARD_APP_END */'
  );
  const expected=nativeApp.replace(
    /^import\s+\{[^}]+\}\s+from\s+'\/earthworks\/controller\.mjs';\s*/,
    ''
  );
  assert.equal(embeddedApp,expected);

  assert.match(page,/Live Yard 001/);
  assert.match(page,/data-mode="manual"/);
  assert.match(page,/data-mode="shadow"/);
  assert.match(page,/data-mode="autonomy"/);
  assert.match(page,/Truck Queue/);
  assert.match(page,/Loader Starvation/);
  assert.match(page,/Blocked Route/);
  assert.match(page,/Production Surge/);
  assert.match(page,/STOP ALL/);
  assert.match(page,/controller\.stopAll/);
  assert.match(page,/controller\.resume/);
  assert.doesNotMatch(page,/type="module"/);
  assert.doesNotMatch(page,/base44\.app/i);
});
