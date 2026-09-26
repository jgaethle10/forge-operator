import crypto from 'node:crypto';
import http from 'node:http';
import { chromium } from 'playwright';
import { createSecureOutboundProxy } from './secure-proxy.mjs';
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

function authorized(req) {
  const raw = String(req.headers.authorization || '');
  const expected = `Bearer ${WORKER_TOKEN}`;
  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
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
  return page.evaluate((limit) => {
    const clean = (value) => String(value || '').replace(/\s+/g,' ').trim();
    const text = clean(document.body?.innerText || '').slice(0, limit);
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .slice(0,50)
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
  }, maxTextChars);
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
    if (req.method === 'GET' && req.url === '/healthz') {
      json(res,200,{
        ok:true,
        service:'evercraft-owned-browser-worker',
        engine:ENGINE,
        mode:'public_read_only',
        active_jobs:activeJobs,
        max_concurrency:MAX_CONCURRENCY
      });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/v1/browse') {
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
      'too_many_actions'
    ]);
    const status = safeClientErrors.has(message) || message.startsWith('unsupported_action') || message.startsWith('invalid_selector') || message.startsWith('invalid_anchor_selector') ? 400 : 500;
    json(res,status,{ok:false,error:message,engine:ENGINE});
  }
});

server.listen(PORT,'0.0.0.0',() => {
  console.log(JSON.stringify({event:'browser_worker_listening',port:PORT,engine:ENGINE,max_concurrency:MAX_CONCURRENCY}));
});

async function shutdown(signal) {
  server.close();
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
