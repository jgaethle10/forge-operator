import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 15 * 60_000;
const MAX_TTL_MS = 60 * 60_000;
const ALLOWED_KEYS = new Set([
  'Enter','Tab','Escape','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'PageUp','PageDown','Home','End','Delete'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function tokenEqualPlainToHash(plain, expectedHash) {
  const a = Buffer.from(sha256(plain), 'hex');
  const b = Buffer.from(String(expectedHash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function boundedInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeHumanBrowserAction(input = {}) {
  const type = String(input.type || '').trim();
  if (type === 'click') return { type, x: boundedInt(input.x, 0, 10000, 0), y: boundedInt(input.y, 0, 10000, 0) };
  if (type === 'type') {
    const text = String(input.text ?? '');
    if (text.length > 4096) throw new Error('typed_text_too_long');
    return { type, text };
  }
  if (type === 'key') {
    const key = String(input.key || '');
    if (!ALLOWED_KEYS.has(key)) throw new Error('unsupported_key');
    return { type, key };
  }
  if (type === 'scroll') return { type, x: boundedInt(input.x, -5000, 5000, 0), y: boundedInt(input.y, -5000, 5000, 700) };
  if (type === 'wait') return { type, ms: boundedInt(input.ms, 0, 5000, 500) };
  if (['go_back','go_forward','reload'].includes(type)) return { type };
  if (type === 'navigate') return { type, url: String(input.url || '').trim() };
  throw new Error('unsupported_human_browser_action');
}

export function receiptForHumanBrowserAction(action = {}) {
  const type = String(action.type || '');
  if (type === 'type') return { type, ok: true, char_count: String(action.text || '').length, secret_text_recorded: false };
  if (type === 'click') return { type, ok: true, x: action.x, y: action.y };
  if (type === 'key') return { type, ok: true, key: action.key };
  if (type === 'scroll') return { type, ok: true, x: action.x, y: action.y };
  if (type === 'wait') return { type, ok: true, ms: action.ms };
  if (['go_back','go_forward','reload'].includes(type)) return { type, ok: true };
  if (type === 'navigate') return { type, ok: true, navigation: 'validated_public_url' };
  return { type, ok: true };
}

export function renderHumanBrowserHandoffPage({ sessionId }) {
  const safeId = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const page = [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#090b0f">',
    '<title>Evercraft Control Room</title>',
    '<style>',
    ':root{color-scheme:dark;--bg:#090b0f;--panel:#0f1318;--panel2:#131820;--line:#242c36;--muted:#8d99a8;--text:#f6f8fb;--soft:#cbd3dd;--good:#7ee2af;--warn:#f4cd7a;--danger:#ff8e8e;--accent:#98b8ff;--shadow:0 24px 80px rgba(0,0,0,.45)}',
    '*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;background:radial-gradient(circle at 50% -20%,#17202b 0,#0b0e13 34%,var(--bg) 64%);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}',
    'button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.app{min-height:100dvh;display:flex;flex-direction:column}.bar{position:sticky;top:0;z-index:20;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(9,11,15,.88);backdrop-filter:blur(20px);padding:10px max(12px,env(safe-area-inset-left))}.barin{max-width:1440px;margin:0 auto;display:flex;align-items:center;gap:10px}.brand{display:flex;align-items:center;gap:10px;white-space:nowrap}.mark{width:28px;height:28px;border:1px solid #425063;border-radius:9px;display:grid;place-items:center;background:linear-gradient(145deg,#18212b,#0f1318);box-shadow:inset 0 1px rgba(255,255,255,.08)}.mark:before{content:"";width:10px;height:10px;border:2px solid #c9d8ff;border-radius:3px;transform:rotate(45deg)}.brandcopy strong{display:block;font-size:12px;letter-spacing:.16em}.brandcopy span{display:block;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.mode{margin-left:auto;display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #2c3c34;border-radius:999px;background:#0e1713;color:#c6f4d9;font-size:12px}.dot{width:7px;height:7px;border-radius:999px;background:var(--good);box-shadow:0 0 16px rgba(126,226,175,.7)}',
    '.main{width:min(1440px,100%);margin:0 auto;padding:14px max(12px,env(safe-area-inset-left)) calc(112px + env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px}.workspace{min-width:0}.chrome{display:grid;grid-template-columns:auto auto auto minmax(120px,1fr) auto auto;gap:7px;align-items:center;padding:9px;border:1px solid var(--line);border-bottom:0;border-radius:16px 16px 0 0;background:#10151b}.iconbtn,.primary,.danger,.key{border:1px solid #303945;background:#161c23;color:#e8edf4;border-radius:10px;min-height:39px;padding:0 11px}.iconbtn{width:39px;padding:0;font-size:18px}.iconbtn:hover,.key:hover{background:#1d2530}.urlwrap{position:relative;min-width:0}.lock{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--good)}.url{width:100%;height:39px;padding:0 12px 0 30px;border:1px solid #303945;border-radius:10px;background:#0c1015;color:#dbe2eb;outline:none}.url:focus{border-color:#607ba6;box-shadow:0 0 0 3px rgba(152,184,255,.08)}.primary{background:#dde7ff;color:#111827;border-color:#dde7ff;font-weight:700}.danger{border-color:#563333;background:#201313;color:#ffd4d4}',
    '.stage{position:relative;border:1px solid var(--line);border-radius:0 0 16px 16px;overflow:hidden;background:#050607;box-shadow:var(--shadow);min-height:280px}.screen{position:relative;display:grid;place-items:center;min-height:280px}.screen img{display:block;width:100%;height:auto;max-height:calc(100dvh - 230px);object-fit:contain;background:#050607;cursor:crosshair;user-select:none;-webkit-user-drag:none}.screen.loading:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.035),transparent);animation:sweep 1.3s infinite;pointer-events:none}.pointerhint{position:absolute;left:14px;bottom:12px;background:rgba(6,8,11,.76);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px);padding:6px 9px;border-radius:9px;color:#b8c2cf;font-size:11px;pointer-events:none}@keyframes sweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}',
    '.rail{display:flex;flex-direction:column;gap:10px}.card{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,#11161d,#0d1116);padding:13px}.eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#738094;margin-bottom:8px}.card h2{font-size:14px;margin:0 0 8px}.card p{margin:0;color:#aeb8c5;font-size:12px}.trust{display:grid;gap:9px}.trustrow{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start}.trusticon{width:22px;height:22px;border:1px solid #304338;border-radius:7px;display:grid;place-items:center;color:var(--good);font-size:11px}.metric{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.055);font-size:12px}.metric:first-of-type{border-top:0}.metric span{color:var(--muted)}.metric strong{font-weight:600;color:#dfe6ef;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dock{position:fixed;z-index:30;left:0;right:0;bottom:0;padding:10px max(12px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(9,11,15,0),rgba(9,11,15,.94) 28%,#090b0f 100%)}.dockin{width:min(1120px,100%);margin:0 auto;border:1px solid #2a323d;border-radius:16px;background:rgba(15,19,24,.96);box-shadow:0 -12px 50px rgba(0,0,0,.35);padding:9px}.typebar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center}.privacy{height:42px;padding:0 11px;border:1px solid #304338;border-radius:11px;background:#0e1713;color:#bdeaca;font-size:12px}.secret{height:42px;width:100%;border:1px solid #303945;border-radius:11px;background:#0a0e13;color:#fff;padding:0 12px;outline:none}.secret:focus{border-color:#607ba6;box-shadow:0 0 0 3px rgba(152,184,255,.08)}.send{height:42px;padding:0 15px;border:0;border-radius:11px;background:#e7edff;color:#101521;font-weight:800}.keys{display:flex;gap:6px;margin-top:7px;overflow:auto;padding-bottom:1px}.key{min-height:31px;padding:0 10px;white-space:nowrap;font-size:12px}.spacer{flex:1}.sessionline{display:flex;align-items:center;gap:8px;color:#9ca8b7;font-size:11px;margin-top:7px;padding:0 2px}.sessionline .live{color:#bfeccf}.sessionline .error{color:#ffb1b1}',
    '.toast{position:fixed;top:72px;left:50%;transform:translate(-50%,-10px);z-index:50;background:#171e27;border:1px solid #354050;border-radius:11px;padding:9px 12px;box-shadow:0 14px 40px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:.18s}.toast.show{opacity:1;transform:translate(-50%,0)}',
    '@media(max-width:860px){.main{grid-template-columns:1fr}.rail{display:grid;grid-template-columns:1fr 1fr}.chrome{grid-template-columns:auto auto auto minmax(0,1fr) auto}.chrome .closebtn{display:none}.screen img{max-height:none}.barin{gap:8px}.brandcopy span{display:none}}',
    '@media(max-width:560px){.main{padding-top:9px}.rail{grid-template-columns:1fr}.rail .trustcard{display:none}.chrome{grid-template-columns:auto auto auto 1fr auto;padding:7px;gap:5px}.iconbtn{width:35px;min-height:35px}.url{height:35px}.chrome .gobtn{display:none}.mode{font-size:11px;padding:6px 8px}.brandcopy strong{font-size:11px}.dockin{border-radius:14px}.privacy{width:40px;font-size:0;padding:0}.privacy:after{content:"Private";font-size:10px}.typebar{grid-template-columns:40px minmax(0,1fr) auto}.secret,.send{height:40px}}',
    '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}',
    '</style></head><body>',
    '<div class="app">',
    '<header class="bar"><div class="barin"><div class="brand"><div class="mark" aria-hidden="true"></div><div class="brandcopy"><strong>EVERCRAFT</strong><span>Control Room</span></div></div><div class="mode"><span class="dot"></span><span>Human control</span></div></div></header>',
    '<main class="main">',
    '<section class="workspace" aria-label="Remote browser">',
    '<div class="chrome">',
    '<button class="iconbtn" id="back" aria-label="Back">‹</button>',
    '<button class="iconbtn" id="forward" aria-label="Forward">›</button>',
    '<button class="iconbtn" id="reload" aria-label="Reload">↻</button>',
    '<div class="urlwrap"><span class="lock" id="lock">●</span><input id="url" class="url" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Browser address"></div>',
    '<button class="primary gobtn" id="go">Go</button>',
    '<button class="danger closebtn" id="close">End</button>',
    '</div>',
    '<div class="stage"><div class="screen loading" id="screen"><img id="shot" alt="Live Evercraft browser session"><div class="pointerhint">Tap anywhere to control the browser</div></div></div>',
    '</section>',
    '<aside class="rail">',
    '<section class="card trustcard"><div class="eyebrow">Trust boundary</div><div class="trust"><div class="trustrow"><div class="trusticon">✓</div><div><h2>Evercraft-owned session</h2><p>Your login stays inside this isolated browser context. Typed text is never returned in receipts.</p></div></div><div class="trustrow"><div class="trusticon">⏱</div><div><h2>Ephemeral by design</h2><p>No persistent browser profile in this version. Closing the room destroys the session context.</p></div></div></div></section>',
    '<section class="card"><div class="eyebrow">Session</div><div class="metric"><span>Connection</span><strong id="connection">Connecting</strong></div><div class="metric"><span>Site</span><strong id="site">—</strong></div><div class="metric"><span>Transport</span><strong id="transport">—</strong></div><div class="metric"><span>Expires</span><strong id="expires">—</strong></div><div class="metric"><span>Actions</span><strong id="actions">0</strong></div></section>',
    '</aside>',
    '</main>',
    '<div class="dock"><div class="dockin">',
    '<div class="typebar"><button id="privacy" class="privacy" aria-pressed="true" title="Private typing is on">Private</button><input id="text" class="secret" type="password" autocomplete="new-password" autocapitalize="none" placeholder="Type into the focused browser field" aria-label="Secure browser typing"><button id="type" class="send">Send</button></div>',
    '<div class="keys"><button class="key" data-key="Tab">Tab</button><button class="key" data-key="Enter">Enter</button><button class="key" data-key="Backspace">⌫</button><button class="key" data-key="Escape">Esc</button><button class="key" data-key="ArrowUp">↑</button><button class="key" data-key="ArrowDown">↓</button><button class="key" id="scrollup">Scroll up</button><button class="key" id="scrolldown">Scroll down</button><span class="spacer"></span><button class="key" id="fullscreen">Full screen</button><button class="key" id="refresh">Refresh</button><button class="key" id="close2">End session</button></div>',
    '<div class="sessionline"><span class="live" id="state">Evercraft secure handoff</span><span>•</span><span id="status">Connecting to browser…</span></div>',
    '</div></div>',
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>',
    '</div>',
    '<script>',
    '(function(){',
    'const sessionId=' + JSON.stringify(safeId) + ';',
    'const hash=new URLSearchParams(location.hash.slice(1));',
    'const claim=hash.get("claim")||"";',
    'history.replaceState(null,"",location.pathname);',
    'const $=function(id){return document.getElementById(id)};',
    'const shot=$("shot"),screen=$("screen"),status=$("status"),urlInput=$("url"),textInput=$("text"),connection=$("connection"),site=$("site"),transport=$("transport"),expires=$("expires"),actions=$("actions"),state=$("state"),toast=$("toast");',
    'let busy=false,closed=false,actionCount=0,privateTyping=true,lastHash="",refreshTimer=null;',
    'function announce(message){toast.textContent=message;toast.classList.add("show");setTimeout(function(){toast.classList.remove("show")},1500)}',
    'function setBusy(next,label){busy=next;screen.classList.toggle("loading",next);document.querySelectorAll("button").forEach(function(button){button.disabled=next&&button.id!=="close"&&button.id!=="close2"});if(label)status.textContent=label}',
    'async function api(path,options){options=options||{};const headers=Object.assign({},options.headers||{},{"x-evercraft-browser-claim":claim});const response=await fetch(path,Object.assign({},options,{headers,cache:"no-store"}));const body=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(body.error||("http_"+response.status));return body;}',
    'function domainFrom(value){try{return new URL(value).hostname}catch{return "—"}}',
    'function updateExpiry(value){if(!value){expires.textContent="—";return}const date=new Date(value);expires.textContent=date.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});}',
    'async function refresh(silent){if(closed||busy&&!silent)return;try{if(!silent)setBusy(true,"Refreshing secure view…");const data=await api("/v1/auth-browser/sessions/"+encodeURIComponent(sessionId)+"/snapshot");if(data.screenshot_sha256!==lastHash){shot.src="data:image/png;base64,"+data.screenshot_base64;lastHash=data.screenshot_sha256||""}shot.dataset.width=String(data.viewport.width);shot.dataset.height=String(data.viewport.height);urlInput.value=data.url||"";connection.textContent="Connected";connection.style.color="var(--good)";site.textContent=domainFrom(data.url);transport.textContent=data.secure_transport?"Encrypted HTTPS":"HTTP";transport.style.color=data.secure_transport?"var(--good)":"var(--warn)";$("lock").style.color=data.secure_transport?"var(--good)":"var(--warn)";updateExpiry(data.expires_at);state.textContent="Evercraft secure handoff";status.textContent=data.title||"Ready";screen.classList.remove("loading");}catch(error){connection.textContent="Needs attention";connection.style.color="var(--danger)";state.textContent="Connection issue";state.className="error";status.textContent=error.message;screen.classList.remove("loading");if(!silent)announce("Session needs attention")}finally{if(!silent)setBusy(false)}}',
    'async function act(action,label){if(closed||busy)return;try{setBusy(true,label||"Applying…");const result=await api("/v1/auth-browser/sessions/"+encodeURIComponent(sessionId)+"/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action)});actionCount=result.action_count||actionCount+1;actions.textContent=String(actionCount);updateExpiry(result.expires_at);await refresh(true);}catch(error){status.textContent=error.message;announce("Action failed")}finally{setBusy(false)}}',
    'shot.addEventListener("click",function(event){if(busy||closed)return;const rect=shot.getBoundingClientRect(),width=Number(shot.dataset.width||1280),height=Number(shot.dataset.height||800),x=Math.round((event.clientX-rect.left)*width/rect.width),y=Math.round((event.clientY-rect.top)*height/rect.height);act({type:"click",x:x,y:y},"Clicking…")});',
    '$("type").onclick=async function(){const text=textInput.value;if(!text)return;textInput.value="";await act({type:"type",text:text},"Typing securely…");textInput.focus()};',
    'textInput.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();$("type").click()}});',
    '$("privacy").onclick=function(){privateTyping=!privateTyping;textInput.type=privateTyping?"password":"text";this.textContent=privateTyping?"Private":"Visible";this.setAttribute("aria-pressed",String(privateTyping));this.title=privateTyping?"Private typing is on":"Typing is visible on this device";announce(privateTyping?"Private typing on":"Typing visible on this device")};',
    'document.querySelectorAll("[data-key]").forEach(function(button){button.onclick=function(){act({type:"key",key:button.dataset.key},"Sending key…")}});',
    '$("scrollup").onclick=function(){act({type:"scroll",y:-700},"Scrolling…")};$("scrolldown").onclick=function(){act({type:"scroll",y:700},"Scrolling…")};',
    '$("back").onclick=function(){act({type:"go_back"},"Going back…")};$("forward").onclick=function(){act({type:"go_forward"},"Going forward…")};$("reload").onclick=function(){act({type:"reload"},"Reloading…")};',
    '$("go").onclick=function(){act({type:"navigate",url:urlInput.value},"Navigating…")};urlInput.addEventListener("keydown",function(event){if(event.key==="Enter"){$("go").click()}});',
    '$("refresh").onclick=function(){refresh(false)};',
    '$("fullscreen").onclick=async function(){try{if(!document.fullscreenElement)await screen.requestFullscreen();else await document.exitFullscreen()}catch{} };',
    'async function endSession(){if(closed)return;try{setBusy(true,"Closing session…");await api("/v1/auth-browser/sessions/"+encodeURIComponent(sessionId),{method:"DELETE"});closed=true;connection.textContent="Closed";connection.style.color="var(--muted)";state.textContent="Session closed";status.textContent="The isolated browser context has been destroyed.";shot.removeAttribute("src");document.querySelectorAll("button,input").forEach(function(node){node.disabled=true})}catch(error){status.textContent="Close failed: "+error.message}finally{screen.classList.remove("loading")}}',
    '$("close").onclick=endSession;$("close2").onclick=endSession;',
    'document.addEventListener("visibilitychange",function(){if(!document.hidden&&!closed)refresh(true)});',
    'refresh(false);refreshTimer=setInterval(function(){if(!document.hidden&&!busy&&!closed)refresh(true)},1800);',
    'window.addEventListener("pagehide",function(){if(refreshTimer)clearInterval(refreshTimer)});',
    '})();',
    '</script></body></html>'
  ];
  return page.join('');
}

export class AuthenticatedBrowserSessionManager {
  constructor({ getBrowser, outboundProxyPromise, assertPublicHttpUrl, assertBrowserRequestUrl, redactUrl, ttlMs = DEFAULT_TTL_MS, maxSessions = 4 } = {}) {
    if (typeof getBrowser !== 'function') throw new Error('authenticated_browser_get_browser_required');
    if (!outboundProxyPromise) throw new Error('authenticated_browser_proxy_required');
    if (typeof assertPublicHttpUrl !== 'function') throw new Error('authenticated_browser_url_policy_required');
    if (typeof assertBrowserRequestUrl !== 'function') throw new Error('authenticated_browser_request_policy_required');
    this.getBrowser = getBrowser;
    this.outboundProxyPromise = outboundProxyPromise;
    this.assertPublicHttpUrl = assertPublicHttpUrl;
    this.assertBrowserRequestUrl = assertBrowserRequestUrl;
    this.redactUrl = typeof redactUrl === 'function' ? redactUrl : (value) => String(value || '');
    this.ttlMs = Math.max(60000, Math.min(MAX_TTL_MS, Number(ttlMs) || DEFAULT_TTL_MS));
    this.maxSessions = Math.max(1, Math.min(12, Number(maxSessions) || 4));
    this.sessions = new Map();
  }

  async reapExpired() {
    const now = Date.now();
    const expired = [...this.sessions.values()].filter((session) => session.expiresAt <= now);
    await Promise.all(expired.map((session) => this.closeSession(session.id).catch(() => {})));
  }

  async createSession({ url, viewport = {} } = {}) {
    await this.reapExpired();
    if (this.sessions.size >= this.maxSessions) throw new Error('authenticated_browser_capacity_exhausted');
    const target = await this.assertPublicHttpUrl(String(url || ''));
    const browser = await this.getBrowser();
    const outboundProxy = await this.outboundProxyPromise;
    const normalizedViewport = {
      width: boundedInt(viewport.width, 640, 1920, 1280),
      height: boundedInt(viewport.height, 480, 1200, 800),
    };
    const context = await browser.newContext({
      proxy: { server: outboundProxy.url },
      viewport: normalizedViewport,
      javaScriptEnabled: true,
      serviceWorkers: 'block',
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      userAgent: 'Evercraft-Web-Human-Handoff/1.0',
    });
    const id = crypto.randomBytes(18).toString('base64url');
    const claimToken = crypto.randomBytes(32).toString('base64url');
    const session = {
      id,
      claimHash: sha256(claimToken),
      context,
      page: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      viewport: normalizedViewport,
      actionCount: 0,
    };

    context.on('page', (page) => {
      session.page = page;
      page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
      page.on('download', (download) => download.cancel().catch(() => {}));
    });

    await context.route('**/*', async (route) => {
      try {
        await this.assertBrowserRequestUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });

    const page = await context.newPage();
    session.page = page;
    this.sessions.set(id, session);
    try {
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
    } catch (error) {
      await this.closeSession(id).catch(() => {});
      throw error;
    }

    return {
      session_id: id,
      claim_token: claimToken,
      expires_at: new Date(session.expiresAt).toISOString(),
      mode: 'human_authorized_ephemeral',
      persisted_profile: false,
      secret_text_returned: false,
    };
  }

  requireSession(id, claimToken) {
    const session = this.sessions.get(String(id || ''));
    if (!session) throw new Error('authenticated_browser_session_not_found');
    if (session.expiresAt <= Date.now()) throw new Error('authenticated_browser_session_expired');
    if (!claimToken || !tokenEqualPlainToHash(claimToken, session.claimHash)) throw new Error('authenticated_browser_claim_invalid');
    return session;
  }

  async snapshot(id, claimToken) {
    const session = this.requireSession(id, claimToken);
    const page = session.page;
    const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'hide' });
    return {
      ok: true,
      session_id: session.id,
      title: String(await page.title()).slice(0, 500),
      url: this.redactUrl(page.url()),
      origin: (() => { try { return new URL(page.url()).origin; } catch { return null; } })(),
      secure_transport: (() => { try { return new URL(page.url()).protocol === 'https:'; } catch { return false; } })(),
      viewport: session.viewport,
      screenshot_base64: png.toString('base64'),
      screenshot_sha256: crypto.createHash('sha256').update(png).digest('hex'),
      expires_at: new Date(session.expiresAt).toISOString(),
      mode: 'human_authorized_ephemeral',
    };
  }

  async act(id, claimToken, rawAction) {
    const session = this.requireSession(id, claimToken);
    if (session.actionCount >= 500) throw new Error('authenticated_browser_action_limit');
    const action = normalizeHumanBrowserAction(rawAction);
    const page = session.page;
    if (action.type === 'click') await page.mouse.click(action.x, action.y);
    else if (action.type === 'type') await page.keyboard.type(action.text, { delay: 15 });
    else if (action.type === 'key') await page.keyboard.press(action.key);
    else if (action.type === 'scroll') await page.mouse.wheel(action.x, action.y);
    else if (action.type === 'wait') await page.waitForTimeout(action.ms);
    else if (action.type === 'go_back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    else if (action.type === 'go_forward') await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    else if (action.type === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    else if (action.type === 'navigate') {
      const target = await this.assertPublicHttpUrl(action.url);
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    session.actionCount += 1;
    session.expiresAt = Math.min(session.createdAt + MAX_TTL_MS, Math.max(session.expiresAt, Date.now() + 5 * 60000));
    return {
      ...receiptForHumanBrowserAction(action),
      action_count: session.actionCount,
      expires_at: new Date(session.expiresAt).toISOString(),
    };
  }

  async closeSession(id, claimToken = null) {
    const session = this.sessions.get(String(id || ''));
    if (!session) return { ok: true, closed: false };
    if (claimToken !== null && (!claimToken || !tokenEqualPlainToHash(claimToken, session.claimHash))) {
      throw new Error('authenticated_browser_claim_invalid');
    }
    this.sessions.delete(session.id);
    await session.context.close().catch(() => {});
    return { ok: true, closed: true, session_id: session.id };
  }

  async closeAll() {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.closeSession(id).catch(() => {})));
  }
}
