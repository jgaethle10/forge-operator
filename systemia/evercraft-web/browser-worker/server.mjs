import crypto from 'node:crypto';
import http from 'node:http';
import { chromium } from 'playwright';
import { createSecureOutboundProxy } from './secure-proxy.mjs';
import { HEADING_SELECTOR, MAX_HEADINGS } from './snapshot-contract.mjs';
import { AuthenticatedBrowserSessionManager, renderHumanBrowserHandoffPage } from './authenticated-handoff.mjs';
import {
  assertBrowserRequestUrl,
  assertPublicHttpUrl,
  redactUrl,
  sanitizeJob
} from './policy.mjs';

const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT || 8787)));
const WORKER_TOKEN = String(process.env.EVERCRAFT_BROWSER_WORKER_TOKEN || '');
const MAX_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.EVERCRAFT_BROWSER_MAX_CONCURRENCY || 2)));
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const ENGINE = 'evercraft-owned-browser-worker-v1';
const AUTH_OPERATOR_TOKEN = String(process.env.EVERCRAFT_AUTH_BROWSER_OPERATOR_TOKEN || '');
const AUTH_SESSION_TTL_MS = Math.max(60_000, Math.min(60 * 60_000, Number(process.env.EVERCRAFT_AUTH_BROWSER_SESSION_TTL_MS || 15 * 60_000)));

if (!WORKER_TOKEN) {
  throw new Error('EVERCRAFT_BROWSER_WORKER_TOKEN is required');
}

let browserPromise = null;
let activeJobs = 0;
const outboundProxyPromise = createSecureOutboundProxy();

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'content-length':Buffer.byteLength(payload),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(payload);
}

function html(res, status, body) {
  const payload = String(body || '');
  res.writeHead(status, {
    'content-type':'text/html; charset=utf-8',
    'content-length':Buffer.byteLength(payload),
    'cache-control':'no-store',
    'content-security-policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY'
  });
  res.end(payload);
}

function bearerAuthorized(req, token) {
  if (!token) return false;
  const raw = String(req.headers.authorization || '');
  const expected = `Bearer ${token}`;
  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}

function authorized(req) {
  return bearerAuthorized(req, WORKER_TOKEN);
}

function authOperatorAuthorized(req) {
  return bearerAuthorized(req, AUTH_OPERATOR_TOKEN);
}

function browserClaim(req) {
  return String(req.headers['x-evercraft-browser-claim'] || '').trim();
}

function browserAccess(req) {
  return String(req.headers['x-evercraft-browser-access'] || '').trim();
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless:true }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

const authSessions = AUTH_OPERATOR_TOKEN ? new AuthenticatedBrowserSessionManager({
  getBrowser,
  outboundProxyPromise,
  assertPublicHttpUrl,
  assertBrowserRequestUrl,
  redactUrl,
  ttlMs:AUTH_SESSION_TTL_MS,
}) : null;

async function runAction(page, action, timeoutMs) {
  if (action.type === 'wait') {
    await page.waitForTimeout(action.ms);
    return { type:action.type, ok:true, ms:action.ms };
  }

  if (action.type === 'wait_for_selector') {
    await page.locator(action.selector).first().waitFor({
      state:'attached',
      timeout:Math.min(action.timeout_ms, timeoutMs)
    });
    return { type:action.type, ok:true, selector:action.selector };
  }

  if (action.type === 'scroll') {
    await page.evaluate(({x,y}) => window.scrollBy(x,y), {x:action.x,y:action.y});
    return { type:action.type, ok:true, x:action.x, y:action.y };
  }

  if (action.type === 'follow_anchor') {
    const locator = page.locator(action.selector).first();
    const details = await locator.evaluate((node) => ({
      tag:String(node?.tagName || '').toLowerCase(),
      href:node instanceof HTMLAnchorElement ? node.href : null
    }));
    if (details.tag !== 'a' || !details.href) throw new Error('follow_anchor_requires_anchor');
    const target = await assertPublicHttpUrl(details.href);
    await page.goto(target.toString(), {waitUntil:'domcontentloaded', timeout:timeoutMs});
    return { type:action.type, ok:true, selector:action.selector, navigated_to:redactUrl(target) };
  }

  throw new Error('unsupported_action');
}

async function extractPage(page, maxTextChars) {
  return page.evaluate(({limit, headingSelector, maxHeadings}) => {
    const clean = (value) => String(value || '').replace(/\s+/g,' ').trim();
    const text = clean(document.body?.innerText || '').slice(0, limit);
    const headings = [...document.querySelectorAll(headingSelector)]
      .slice(0,maxHeadings)
      .map((node) => ({level:node.tagName.toLowerCase(), text:clean(node.textContent).slice(0,300)}))
      .filter((row) => row.text);
    const links = [...document.querySelectorAll('a[href]')]
      .slice(0,150)
      .map((node) => ({text:clean(node.textContent).slice(0,200), href:String(node.href || '')}))
      .filter((row) => /^https?:\/\//i.test(row.href));
    const meta = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    return {
      title:clean(document.title).slice(0,500),
      meta_description:clean(meta).slice(0,1000),
      text,
      headings,
      links
    };
  }, {limit:maxTextChars, headingSelector:HEADING_SELECTOR, maxHeadings:MAX_HEADINGS});
}

async function browse(job) {
  const startedAt = new Date();
  const browser = await getBrowser();
  const outboundProxy = await outboundProxyPromise;
  const context = await browser.newContext({
    proxy:{server:outboundProxy.url},
    viewport:job.viewport,
    javaScriptEnabled:true,
    serviceWorkers:'block',
    acceptDownloads:false,
    ignoreHTTPSErrors:false,
    userAgent:'Evercraft-Web-Owned-Browser/1.0'
  });

  const blocked = [];
  const consoleErrors = [];
  const actionReceipts = [];
  let page;

  try {
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', async (ws) => {
        blocked.push({kind:'websocket',url:redactUrl(ws.url())});
        await ws.close();
      });
    }

    await context.route('**/*', async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const requestUrl = request.url();

      if (!['GET','HEAD','OPTIONS'].includes(method)) {
        blocked.push({kind:'method',method,url:redactUrl(requestUrl)});
        await route.abort('blockedbyclient');
        return;
      }

      try {
        await assertBrowserRequestUrl(requestUrl);
      } catch (error) {
        blocked.push({
          kind:'network_boundary',
          method,
          url:redactUrl(requestUrl),
          reason:error instanceof Error ? error.message : String(error)
        });
        await route.abort('blockedbyclient');
        return;
      }

      const headers = {...request.headers()};
      delete headers.cookie;
      delete headers.authorization;
      delete headers['proxy-authorization'];
      await route.continue({headers});
    });

    page = await context.newPage();
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && consoleErrors.length < 50) {
        consoleErrors.push(msg.text().slice(0,1000));
      }
    });
    page.on('download', (download) => download.cancel().catch(() => {}));

    const target = await assertPublicHttpUrl(job.url);
    const response = await page.goto(target.toString(), {
      waitUntil:'domcontentloaded',
      timeout:job.timeout_ms
    });
    await page.waitForLoadState('networkidle', {timeout:1500}).catch(() => {});

    for (const action of job.actions) {
      const began = Date.now();
      try {
        const receipt = await runAction(page, action, job.timeout_ms);
        actionReceipts.push({...receipt,duration_ms:Date.now()-began});
      } catch (error) {
        actionReceipts.push({
          type:action.type,
          ok:false,
          duration_ms:Date.now()-began,
          error:error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    const snapshot = await extractPage(page, job.max_text_chars);
    const finalUrl = redactUrl(page.url());
    const status = response?.status() || 0;

    let screenshot = null;
    if (job.include_screenshot) {
      const png = await page.screenshot({
        type:'png',
        fullPage:false,
        animations:'disabled',
        caret:'hide'
      });
      screenshot = {
        bytes:png.length,
        sha256:sha256(png),
        base64:job.include_screenshot_base64 && png.length <= MAX_SCREENSHOT_BYTES ? png.toString('base64') : null,
        base64_omitted:job.include_screenshot_base64 && png.length > MAX_SCREENSHOT_BYTES
      };
    }

    const finishedAt = new Date();
    const evidence = {
      engine:ENGINE,
      mode:'public_read_only',
      requested_url:redactUrl(target),
      final_url:finalUrl,
      http_status:status,
      title:snapshot.title,
      text_sha256:sha256(snapshot.text),
      screenshot_sha256:screenshot?.sha256 || null,
      actions:actionReceipts,
      blocked_network_events:blocked,
      console_errors:consoleErrors,
      started_at:startedAt.toISOString(),
      finished_at:finishedAt.toISOString(),
      duration_ms:finishedAt.getTime()-startedAt.getTime(),
      boundaries:{
        fresh_context_per_job:true,
        persisted_cookies:false,
        outbound_cookie_headers_stripped:true,
        outbound_authorization_headers_stripped:true,
        allowed_network_methods:['GET','HEAD','OPTIONS'],
        private_and_reserved_targets_blocked:true,
        dns_pinned_outbound_proxy:true,
        allowed_destination_ports:[80,443],
        websocket_blocked:true,
        form_submit_action_supported:false,
        arbitrary_click_action_supported:false,
        downloads_allowed:false
      }
    };

    return {
      ok:true,
      ...evidence,
      snapshot,
      screenshot,
      evidence_receipt_sha256:sha256(JSON.stringify(evidence))
    };
  } finally {
    await context.close().catch(() => {});
  }
}

const server = http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname === '/healthz') {
      json(res,200,{
        ok:true,
        service:'evercraft-owned-browser-worker',
        engine:ENGINE,
        mode:'public_read_only',
        active_jobs:activeJobs,
        max_concurrency:MAX_CONCURRENCY,
        authenticated_handoff_available:Boolean(authSessions),
        authenticated_handoff_mode:authSessions ? 'human_authorized_ephemeral' : 'disabled'
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/auth-browser/health') {
      json(res,200,{
        ok:true,
        service:'evercraft-authenticated-browser-handoff',
        enabled:Boolean(authSessions),
        mode:authSessions ? 'human_authorized_ephemeral' : 'disabled',
        persistent_profile:false,
        secret_text_returned:false
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/auth-browser/sessions') {
      if (!authSessions) {
        json(res,503,{ok:false,error:'authenticated_browser_disabled'});
        return;
      }
      if (!authOperatorAuthorized(req)) {
        json(res,401,{ok:false,error:'authenticated_browser_operator_credential_required'});
        return;
      }
      const body = await readJson(req);
      const created = await authSessions.createSession(body);
      const claimToken = created.claim_token;
      const safe = {...created};
      delete safe.claim_token;
      json(res,201,{
        ok:true,
        ...safe,
        handoff_path:'/handoff/' + encodeURIComponent(created.session_id) + '#claim=' + encodeURIComponent(claimToken)
      });
      return;
    }

    const handoffMatch = pathname.match(/^\/handoff\/([A-Za-z0-9_-]+)$/);
    if (req.method === 'GET' && handoffMatch) {
      if (!authSessions) {
        html(res,503,'<!doctype html><title>Evercraft Browser</title><p>Authenticated browser handoff is disabled.</p>');
        return;
      }
      html(res,200,renderHumanBrowserHandoffPage({sessionId:handoffMatch[1]}));
      return;
    }

    const redeemMatch = pathname.match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)\/redeem$/);
    if (req.method === 'POST' && redeemMatch) {
      if (!authSessions) {
        json(res,503,{ok:false,error:'authenticated_browser_disabled'});
        return;
      }
      json(res,200,authSessions.redeemClaim(redeemMatch[1],browserClaim(req)));
      return;
    }

    const snapshotMatch = pathname.match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)\/snapshot$/);
    if (req.method === 'GET' && snapshotMatch) {
      if (!authSessions) {
        json(res,503,{ok:false,error:'authenticated_browser_disabled'});
        return;
      }
      json(res,200,await authSessions.snapshot(snapshotMatch[1],browserAccess(req)));
      return;
    }

    const actionMatch = pathname.match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)\/action$/);
    if (req.method === 'POST' && actionMatch) {
      if (!authSessions) {
        json(res,503,{ok:false,error:'authenticated_browser_disabled'});
        return;
      }
      const body = await readJson(req);
      json(res,200,await authSessions.act(actionMatch[1],browserAccess(req),body));
      return;
    }

    const closeMatch = pathname.match(/^\/v1\/auth-browser\/sessions\/([A-Za-z0-9_-]+)$/);
    if (req.method === 'DELETE' && closeMatch) {
      if (!authSessions) {
        json(res,503,{ok:false,error:'authenticated_browser_disabled'});
        return;
      }
      json(res,200,await authSessions.closeSession(closeMatch[1],browserAccess(req)));
      return;
    }

    if (req.method !== 'POST' || pathname !== '/v1/browse') {
      json(res,404,{ok:false,error:'not_found'});
      return;
    }

    if (!authorized(req)) {
      json(res,401,{ok:false,error:'unauthorized'});
      return;
    }

    if (activeJobs >= MAX_CONCURRENCY) {
      json(res,429,{ok:false,error:'capacity_exhausted',retryable:true});
      return;
    }

    const body = await readJson(req);
    const job = sanitizeJob(body);
    activeJobs += 1;
    try {
      const result = await browse(job);
      json(res,200,result);
    } finally {
      activeJobs -= 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authErrors = new Set([
      'authenticated_browser_claim_invalid',
      'authenticated_browser_access_invalid',
      'authenticated_browser_claim_not_redeemed',
      'authenticated_browser_operator_credential_required'
    ]);
    const missingErrors = new Set([
      'authenticated_browser_session_not_found'
    ]);
    const safeClientErrors = new Set([
      'invalid_json',
      'request_body_too_large',
      'invalid_url_length',
      'invalid_url',
      'unsupported_url_scheme',
      'missing_hostname',
      'embedded_credentials_not_allowed',
      'unsupported_port',
      'private_or_reserved_target',
      'dns_resolution_failed',
      'dns_resolution_empty',
      'too_many_actions',
      'authenticated_browser_claim_already_redeemed',
      'authenticated_browser_session_expired',
      'authenticated_browser_action_limit',
      'authenticated_browser_capacity_exhausted',
      'typed_text_too_long',
      'unsupported_key',
      'unsupported_human_browser_action'
    ]);
    const status = authErrors.has(message) ? 401 : missingErrors.has(message) ? 404 : safeClientErrors.has(message) || message.startsWith('unsupported_action') || message.startsWith('invalid_selector') || message.startsWith('invalid_anchor_selector') ? 400 : 500;
    json(res,status,{ok:false,error:message,engine:ENGINE});
  }
});

server.listen(PORT,'0.0.0.0',() => {
  console.log(JSON.stringify({event:'browser_worker_listening',port:PORT,engine:ENGINE,max_concurrency:MAX_CONCURRENCY}));
});

async function shutdown(signal) {
  server.close();
  if (authSessions) await authSessions.closeAll().catch(() => {});
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {}
  }
  try {
    const outboundProxy = await outboundProxyPromise;
    await outboundProxy.close();
  } catch {}
  console.log(JSON.stringify({event:'browser_worker_stopped',signal}));
  process.exit(0);
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
