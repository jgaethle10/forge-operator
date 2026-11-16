#!/usr/bin/env node
// Evercraft Journal: Chromium DevTools mobile/desktop layout proof.
// Page.setDocumentContent keeps this offline: no legacy host or external fetches.
// The page layout is real Chromium CSS rendering, not a screenshot of a mock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || 'public/journal');
const source = path.join(root, 'index.html');
const out = path.resolve(process.argv[3] || 'artifacts/journal-visual-qa');
if (!fs.existsSync(source)) throw new Error('journal_visual_qa_missing_index');
const html = fs.readFileSync(source, 'utf8');
if (!html.includes('id="lead-title"') || !html.includes('aria-label="Journal sections"'))
  throw new Error('journal_visual_qa_editorial_surface_missing');
const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
const firstStory = [...(index.stories || []), ...(index.archive || [])][0];
if (!firstStory) throw new Error('journal_visual_qa_no_story_to_read');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(firstStory.slug))
  throw new Error('journal_visual_qa_invalid_story_slug');
const articlePath = path.join(root, firstStory.slug, 'index.html');
if (!fs.existsSync(articlePath)) throw new Error('journal_visual_qa_article_missing');
const articleHtml = fs.readFileSync(articlePath, 'utf8');
if (!articleHtml.includes('id="article-body"') || !articleHtml.includes('id="play"'))
  throw new Error('journal_visual_qa_article_reader_missing');
fs.mkdirSync(out, { recursive: true });

const candidate = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
const chrome = candidate.find(command => spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0);
if (!chrome) throw new Error('journal_visual_qa_chromium_missing');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-visual-'));
const profile = path.join(tmp, 'profile');
const proc = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });
let socket;
let launchError;
proc.on('error', error => { launchError = error; });
const pending = new Map();
let nextId = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('journal_visual_qa_cdp_timeout:' + method));
    }, 15000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function openDevTools() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 300; i++) {
    if (launchError) throw launchError;
    if (proc.exitCode !== null) throw new Error('journal_visual_qa_browser_exited:' + proc.exitCode);
    if (fs.existsSync(portFile)) {
      port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
      break;
    }
    await sleep(100);
  }
  if (!port) throw new Error('journal_visual_qa_debugger_not_ready');
  const response = await fetch('http://127.0.0.1:' + port + '/json/list');
  if (!response.ok) throw new Error('journal_visual_qa_debugger_unavailable');
  const targets = await response.json();
  const page = targets.find(target => target.type === 'page');
  if (!page) throw new Error('journal_visual_qa_no_browser_page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    clearTimeout(item.timeout);
    if (data.error) item.reject(new Error(data.error.message));
    else item.resolve(data.result || {});
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
}

const expression = '(() => {' +
  'const nav=document.querySelector("nav[aria-label=\\"Journal sections\\"]");' +
  'const lead=document.getElementById("lead-title");' +
  'const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden");' +
  'const broken=[...(nav?.querySelectorAll("a[href^=\\"#\\"]")||[])].filter(a=>!document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)))).map(a=>a.getAttribute("href"));' +
  'return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,mobileLayout:matchMedia("(max-width:550px)").matches,navVisible:visible(nav),leadVisible:visible(lead),brokenAnchors:broken,archiveNotice:document.body.textContent.includes("No current live edition")};' +
  '})()';

const articleExpression = '(() => {' +
  'const reader=document.getElementById("article-body");' +
  'const listen=document.getElementById("play");' +
  'const toc=document.querySelector(".article-toc");' +
  'const sources=document.querySelector("section.sources");' +
  'const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden");' +
  'const broken=[...(toc?.querySelectorAll("a")||[])].filter(a=>{const href=a.getAttribute("href");return href && href.startsWith("#") && !document.getElementById(decodeURIComponent(href.slice(1)));}).map(a=>a.getAttribute("href"));' +
  'return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,mobileLayout:matchMedia("(max-width:550px)").matches,readerVisible:visible(reader),tocVisible:visible(toc),sourcesVisible:visible(sources),listenPresent:!!listen,brokenAnchors:broken};' +
  '})()';

async function run() {
  await openDevTools();
  const results = [];
  const surfaces = [
    { name: 'home', document: html },
    { name: 'article', document: articleHtml }
  ];
  for (const surface of surfaces) {
    for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
      await command('Page.navigate', { url: 'about:blank' });
      await command('Emulation.clearDeviceMetricsOverride');
      await command('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height,
        deviceScaleFactor: 1, mobile: viewport.name === 'phone'
      });
      const tree = await command('Page.getFrameTree');
      await command('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: surface.document });
      await command('Runtime.evaluate', {
        expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        awaitPromise: true
      });
      const evaluation = await command('Runtime.evaluate', {
        expression: surface.name === 'home' ? expression : articleExpression,
        returnByValue: true
      });
      if (evaluation.exceptionDetails) throw new Error('journal_visual_qa_js_error:' + surface.name);
      const metrics = evaluation.result?.value;
      const viewportTolerance = viewport.name === 'phone' ? 6 : 0;
      const sharedPass = metrics && Math.abs(metrics.width - viewport.width) <= viewportTolerance &&
        metrics.mobileLayout === (viewport.name === 'phone') && !metrics.horizontalOverflow && metrics.brokenAnchors.length === 0;
      const surfacePass = surface.name === 'home'
        ? metrics?.navVisible && metrics?.leadVisible && (index.live_edition !== false || metrics.archiveNotice)
        : metrics?.readerVisible && metrics?.tocVisible && metrics?.sourcesVisible && metrics?.listenPresent;
      if (!sharedPass || !surfacePass) {
        throw new Error('journal_visual_qa_viewport_failure:' + surface.name + ':' + viewport.name + ':' + JSON.stringify(metrics));
      }
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      if (!image.data) throw new Error('journal_visual_qa_screenshot_missing:' + surface.name + ':' + viewport.name);
      const filename = 'journal-' + surface.name + '-' + viewport.name + '.png';
      fs.writeFileSync(path.join(out, filename), Buffer.from(image.data, 'base64'));
      results.push({ surface: surface.name, viewport: viewport.name, ...metrics, screenshot: filename });
    }
  }
  const receipt = {
    schema: 'evercraft.journal.visual-qa.v2',
    passed: true,
    technique: 'chromium_devtools_real_css_viewport_emulation',
    source: 'public/journal/index.html',
    network: 'outside_http_requests_blocked',
    limitation: 'external images, fonts, browser text-to-speech playback, and public deployment are not verified by this offline test',
    results
  };
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
}
try {
  await run();
} finally {
  for (const item of pending.values()) {
    clearTimeout(item.timeout);
    item.reject(new Error('journal_visual_qa_shutting_down'));
  }
  pending.clear();
  if (socket) socket.close();
  proc.kill('SIGTERM');
  // GitHub Actions cleans the temporary browser profile when the job exits.
}
