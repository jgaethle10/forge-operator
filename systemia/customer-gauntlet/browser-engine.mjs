import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RENDERED_CHECKS = Object.freeze([
  'rendered_screenshot_capture',
  'visual_clipping',
  'javascript_console_errors',
  'keyboard_tab_order',
  'broken_image_scan',
  'blank_state_scan',
  'rendered_brand_metadata'
]);

let browserPromise = null;
const sha = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const slug = value => String(value || 'surface').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'surface';

function viewportFor(persona) {
  return persona?.viewport === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 };
}

export function evaluateRenderedSnapshot(snapshot = {}, persona = {}) {
  const findings = [];
  const mobile = persona?.viewport === 'mobile';

  if (/^(base44 app|vite app|react app|untitled)$/i.test(String(snapshot.title || '').trim())) {
    findings.push({
      code: 'severe_brand_mismatch',
      severity: 'P1',
      stage: 'rendered_brand',
      detail: `Rendered page exposes placeholder title: ${snapshot.title || 'unknown'}`
    });
  }

  if (Number(snapshot.visible_text_chars || 0) < 12 && Number(snapshot.interactive_count || 0) === 0 && Number(snapshot.visible_image_count || 0) === 0) {
    findings.push({
      code: 'rendered_blank_state',
      severity: 'P1',
      stage: 'rendered_state',
      detail: 'Rendered customer surface is effectively blank.'
    });
  }

  if (Number(snapshot.horizontal_overflow_px || 0) > 24) {
    findings.push({
      code: mobile ? 'mobile_blocker' : 'visual_clipping',
      severity: mobile ? 'P1' : 'P2',
      stage: 'rendered_layout',
      detail: `Rendered page overflows the viewport horizontally by ${snapshot.horizontal_overflow_px}px.`
    });
  }

  if (Number(snapshot.clipped_interactive_count || 0) > 0) {
    findings.push({
      code: mobile ? 'mobile_blocker' : 'visual_clipping',
      severity: mobile ? 'P1' : 'P2',
      stage: 'rendered_layout',
      detail: `${snapshot.clipped_interactive_count} visible interactive element(s) are clipped outside the viewport.`
    });
  }

  if (snapshot.rendered_not_found === true) {
    findings.push({
      code: 'rendered_not_found',
      severity: 'P1',
      stage: 'rendered_route',
      detail: 'Rendered customer surface shows a Page Not Found state even though the HTTP response may be successful.'
    });
  }

  if (Number(snapshot.broken_image_count || 0) > 0) {
    findings.push({
      code: 'broken_image',
      severity: 'P2',
      stage: 'rendered_media',
      detail: `${snapshot.broken_image_count} visible image(s) failed to render.`
    });
  }

  if (Number(snapshot.page_error_count || 0) > 0) {
    findings.push({
      code: 'javascript_runtime_error',
      severity: 'P2',
      stage: 'rendered_runtime',
      detail: `${snapshot.page_error_count} uncaught JavaScript page error(s) were observed.`
    });
  } else if (Number(snapshot.console_error_count || 0) > 0) {
    findings.push({
      code: 'javascript_console_error',
      severity: 'P2',
      stage: 'rendered_runtime',
      detail: `${snapshot.console_error_count} console error(s) were observed during the clean customer session.`
    });
  }

  if (Number(snapshot.interactive_count || 0) > 0 && Number(snapshot.focus_order_count || 0) === 0) {
    findings.push({
      code: 'keyboard_focus_failure',
      severity: 'P2',
      stage: 'accessibility',
      detail: 'Visible interactive controls exist, but the clean keyboard-only pass did not establish a tab focus target.'
    });
  }

  if (snapshot.placeholder_copy === true) {
    findings.push({
      code: 'weak_copy',
      severity: 'P2',
      stage: 'rendered_copy',
      detail: 'Rendered customer surface exposes placeholder or unfinished copy.'
    });
  }

  return findings;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const mod = await import('playwright');
      return mod.chromium.launch({ headless: true });
    })();
  }
  return browserPromise;
}

export async function closeOwnedBrowserEngine() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {}
  browserPromise = null;
}

export async function runOwnedBrowserLennox({
  offer,
  persona,
  reviewUrl,
  buyerUrl,
  timeoutMs = 20000,
  rootDir = process.cwd()
} = {}) {
  const targetUrl = buyerUrl || reviewUrl || offer?.public_url || null;
  if (!targetUrl) {
    return {
      status: 'BLOCKED',
      engine: 'raven_nexus_lennox_browser_v1',
      owned_execution: true,
      available: false,
      blocked_reason: 'No customer target URL was available.',
      findings: [],
      checks_completed: [],
      blocked_checks: [...RENDERED_CHECKS]
    };
  }

  let browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    return {
      status: 'BLOCKED',
      engine: 'raven_nexus_lennox_browser_v1',
      owned_execution: true,
      available: false,
      blocked_reason: `Owned Playwright browser runtime unavailable: ${error instanceof Error ? error.message : String(error)}`,
      findings: [],
      checks_completed: [],
      blocked_checks: [...RENDERED_CHECKS]
    };
  }

  const viewport = viewportFor(persona);
  const sessionId = sha(`${offer?.public_id || 'offer'}:${persona?.id || 'persona'}:${Date.now()}:${crypto.randomUUID()}`).slice(0,24);
  const context = await browser.newContext({
    viewport,
    userAgent: `Evercraft-Raven-Nexus-Lennox-Browser/1.0 (${persona?.id || 'unknown'})`,
    locale: 'en-US',
    colorScheme: 'light'
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0,1000));
  });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error).slice(0,1000)));
  page.on('requestfailed', request => {
    if (request.isNavigationRequest() || request.resourceType() === 'document') {
      requestFailures.push({
        url: request.url(),
        failure: request.failure()?.errorText || 'request_failed'
      });
    }
  });

  let navigationError = null;
  let responseStatus = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    responseStatus = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: Math.min(4500, timeoutMs) }).catch(() => {});
    await page.waitForTimeout(250);
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
    await page.waitForTimeout(250).catch(() => {});
  }

  let dom = null;
  try {
    dom = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const interactive = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]')].filter(visible);
      const images = [...document.images].filter(visible);
      const hasHorizontalScroller = element => {
        let node = element.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          const overflowX = style.overflowX;
          if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 2) return true;
          node = node.parentElement;
        }
        return false;
      };
      const clipped = interactive.filter(element => {
        const rect = element.getBoundingClientRect();
        // Vertical position is ordinary page scrolling. Controls intentionally
        // living in an overflow-x scroller are also not clipped defects.
        const escapesViewport = rect.left < -2 || rect.right > innerWidth + 2;
        return escapesViewport && !hasHorizontalScroller(element);
      });
      const docWidth = Math.max(
        document.documentElement?.scrollWidth || 0,
        document.body?.scrollWidth || 0
      );
      const text = String(document.body?.innerText || '').replace(/\s+/g,' ').trim();
      return {
        title: document.title || '',
        visible_text_chars: text.length,
        interactive_count: interactive.length,
        visible_image_count: images.length,
        broken_image_count: images.filter(image => image.complete && image.naturalWidth === 0).length,
        clipped_interactive_count: clipped.length,
        horizontal_overflow_px: Math.max(0, docWidth - innerWidth),
        placeholder_copy: /\blorem ipsum\b|\bTODO\b|coming soon|under construction|replace me/i.test(text.slice(0,20000)),
        rendered_not_found: /\b404\b.{0,80}\bpage not found\b|\bpage not found\b.{0,160}\bcould not be found\b/i.test(text.slice(0,12000))
      };
    });
  } catch {}

  const screenshotDir = path.join(rootDir, 'artifacts', 'customer-gauntlet', 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(
    screenshotDir,
    `${slug(offer?.public_id || offer?.name)}--${slug(persona?.id)}--${sessionId.slice(0,8)}.jpg`
  );
  let screenshotRef = null;
  let screenshotError = null;
  try {
    // Capture the untouched first viewport before keyboard traversal mutates any
    // nested scroll container or moves the page.
    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 68, fullPage: false });
    screenshotRef = path.relative(rootDir, screenshotPath).replaceAll('\\','/');
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
  }


  const focusOrder = [];
  if (dom?.interactive_count > 0) {
    const attempts = Math.min(10, Math.max(3, dom.interactive_count));
    for (let index = 0; index < attempts; index += 1) {
      await page.keyboard.press('Tab').catch(() => {});
      const active = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return '';
        return [
          el.tagName?.toLowerCase() || '',
          el.getAttribute?.('aria-label') || '',
          el.textContent?.trim()?.slice(0,80) || '',
          el.getAttribute?.('name') || '',
          el.getAttribute?.('id') || ''
        ].filter(Boolean).join(':');
      }).catch(() => '');
      if (active && !focusOrder.includes(active)) focusOrder.push(active);
    }
  }


  const snapshot = {
    ...(dom || {}),
    page_error_count: pageErrors.length,
    console_error_count: consoleErrors.length,
    focus_order_count: focusOrder.length
  };
  const findings = evaluateRenderedSnapshot(snapshot, persona);

  if ((!dom || Number(dom.visible_text_chars || 0) === 0) && navigationError) {
    findings.push({
      code: 'browser_runtime_failure',
      severity: 'P1',
      stage: 'owned_browser',
      detail: `Customer page could not be rendered: ${navigationError}`
    });
  } else if (navigationError) {
    findings.push({
      code: 'slow_nonblocking_step',
      severity: 'P2',
      stage: 'owned_browser',
      detail: `Navigation did not reach the requested load condition before timeout, but rendered state was captured: ${navigationError}`
    });
  }

  if (Number(responseStatus || 0) >= 400) {
    findings.push({
      code: 'broken_cta',
      severity: 'P1',
      stage: 'owned_browser',
      detail: `Rendered customer target returned HTTP ${responseStatus}.`
    });
  }

  const completed = RENDERED_CHECKS.filter(check => check !== 'rendered_screenshot_capture' || screenshotRef);
  const blocked = screenshotRef ? [] : ['rendered_screenshot_capture'];

  await context.close().catch(() => {});

  return {
    status: findings.some(f => f.severity === 'P0' || f.severity === 'P1')
      ? 'COMPLETED_WITH_FINDINGS'
      : 'COMPLETED',
    engine: 'raven_nexus_lennox_browser_v1',
    owned_execution: true,
    available: true,
    independent_session: true,
    session_id: sessionId,
    target_url: targetUrl,
    response_status: responseStatus,
    checks_completed: completed,
    blocked_checks: blocked,
    screenshot_ref: screenshotRef,
    screenshot_error: screenshotError,
    viewport,
    snapshot,
    focus_order: focusOrder,
    console_errors: consoleErrors.slice(0,20),
    page_errors: pageErrors.slice(0,20),
    request_failures: requestFailures.slice(0,20),
    findings
  };
}
