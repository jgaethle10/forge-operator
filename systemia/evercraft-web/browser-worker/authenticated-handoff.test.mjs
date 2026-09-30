import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthenticatedBrowserSessionManager,
  normalizeHumanBrowserAction,
  receiptForHumanBrowserAction,
  renderHumanBrowserHandoffPage,
} from './authenticated-handoff.mjs';

test('typed secrets never appear in action receipts', () => {
  const action = normalizeHumanBrowserAction({ type: 'type', text: 'super-secret-password' });
  const receipt = receiptForHumanBrowserAction(action);
  assert.equal(receipt.type, 'type');
  assert.equal(receipt.char_count, 21);
  assert.equal(receipt.secret_text_recorded, false);
  assert.equal(JSON.stringify(receipt).includes('super-secret-password'), false);
});

test('human browser actions are bounded', () => {
  assert.deepEqual(
    normalizeHumanBrowserAction({ type: 'click', x: -50, y: 50000 }),
    { type: 'click', x: 0, y: 10000 }
  );
  assert.throws(
    () => normalizeHumanBrowserAction({ type: 'type', text: 'x'.repeat(4097) }),
    /typed_text_too_long/
  );
  assert.throws(
    () => normalizeHumanBrowserAction({ type: 'key', key: 'Meta+Alt+F4' }),
    /unsupported_key/
  );
  assert.throws(
    () => normalizeHumanBrowserAction({ type: 'evaluate', code: 'document.cookie' }),
    /unsupported_human_browser_action/
  );
});

test('handoff page keeps claim material out of markup and URL query', () => {
  const html = renderHumanBrowserHandoffPage({ sessionId: 'session_123' });
  assert.match(html, /Evercraft-owned session/);
  assert.match(html, /location\.hash/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /x-evercraft-browser-claim/);
  assert.match(html, /x-evercraft-control-room/);
  assert.match(html, /\/redeem/);
  assert.match(html, /credentials:"same-origin"/);
  assert.match(html, /type="password"/);
  assert.match(html, /Evercraft Control Room/);
  assert.match(html, /Human control/);
  assert.match(html, /Ephemeral by design/);
  assert.match(html, /End session/);
  assert.match(html, /setInterval/);
  assert.equal(html.includes('https://cdn.'), false);
  assert.equal(html.includes('#claim='), false);
  assert.equal(html.includes('document.cookie'), false);
  assert.equal(html.includes('localStorage'), false);
  assert.equal(html.includes('sessionStorage'), false);
  assert.equal(html.includes('access_token'), false);
});

test('navigation receipts do not echo destinations', () => {
  const action = normalizeHumanBrowserAction({
    type: 'navigate',
    url: 'https://chatgpt.com/settings',
  });
  const receipt = receiptForHumanBrowserAction(action);
  assert.deepEqual(receipt, {
    type: 'navigate',
    ok: true,
    navigation: 'validated_public_url',
  });
});

test('browser chrome navigation actions are bounded and receipt-safe', () => {
  for (const type of ['go_back', 'go_forward', 'reload']) {
    const action = normalizeHumanBrowserAction({ type });
    assert.deepEqual(action, { type });
    assert.deepEqual(receiptForHumanBrowserAction(action), { type, ok: true });
  }
});


test('bootstrap claim is single-use and cannot authorize ongoing Control Room access', async () => {
  let closed=false;
  const page={
    on(){},
    async goto(){},
    async waitForLoadState(){},
  };
  const context={
    on(){},
    async route(){},
    async newPage(){return page;},
    async close(){closed=true;},
  };
  const browser={
    async newContext(){return context;},
  };
  const manager=new AuthenticatedBrowserSessionManager({
    getBrowser:async()=>browser,
    outboundProxyPromise:Promise.resolve({url:'http://127.0.0.1:9999'}),
    assertPublicHttpUrl:async(value)=>new URL(value),
    assertBrowserRequestUrl:async()=>{},
    redactUrl:(value)=>String(value),
    ttlMs:60_000,
  });

  const created=await manager.createSession({url:'https://example.com/'});
  assert.ok(created.claim_token);
  assert.throws(
    ()=>manager.requireSession(created.session_id,created.claim_token),
    /authenticated_browser_claim_not_redeemed/
  );

  const redeemed=manager.redeemClaim(created.session_id,created.claim_token);
  assert.equal(redeemed.claim_redeemed,true);
  assert.ok(redeemed.access_token);
  assert.notEqual(redeemed.access_token,created.claim_token);

  assert.throws(
    ()=>manager.redeemClaim(created.session_id,created.claim_token),
    /authenticated_browser_claim_already_redeemed/
  );
  assert.throws(
    ()=>manager.requireSession(created.session_id,created.claim_token),
    /authenticated_browser_access_invalid/
  );
  assert.equal(manager.requireSession(created.session_id,redeemed.access_token).id,created.session_id);

  const result=await manager.closeSession(created.session_id,redeemed.access_token);
  assert.equal(result.closed,true);
  assert.equal(closed,true);
});
