#!/usr/bin/env node
/**
 * Game Fabric public recipient *transport* gate.
 * This does not certify football assignments, phone playback, coaching safety,
 * a successful email send, or a paid customer. No POST or personal information.
 */
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const ORIGIN = 'https://headless-ljlkjiyuejs-sociallyguud-140c.wix-site-host.com';
const EXPECTED_MEDIA_SHA256='6c144783a110f4cc44c10359d78695ffce42fe9f02f6f56f4f12fbf35a899691';
const EXPECTED_POSTER_SHA256='9e5647d8cc4ab73aa33da4f16b7bb2f611331d9f104e670516a719dff1df830e';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const ROUTES = {
  reel: '/coach-reel.html',
  classroom: '/playbook-classroom.html',
  video: '/assets/zero-hour-reel.mp4',
  poster: '/assets/zero-hour-poster.jpg',
  engine: '/assets/classroom-engine.js',
  ui: '/assets/classroom-ui.js',
};
function assert(condition, reason) { if (!condition) throw new Error(reason); }
export function checkReelHtml(html) {
  assert(/<video\b[^>]*\bcontrols\b/i.test(html), 'video player/controls missing');
  assert(/<video\b[^>]*\bplaysinline\b/i.test(html), 'iOS playsinline missing');
  assert(/<source\b[^>]*src=["']assets\/zero-hour-reel\.mp4["']/i.test(html), 'video source mismatch');
  assert(/<source\b[^>]*type=["']video\/mp4["']/i.test(html), 'video MIME declaration missing');
  assert(/playbook-classroom\.html/i.test(html), 'classroom CTA missing');
  assert(/Game Fabric research release v2\.9/i.test(html), 'outdated reel version, expected v2.9');
  assert(/nickel Cover 3 edge pressure/i.test(html), 'stale demo call, expected nickel Cover 3');
  assert(/Open the MP4 directly/i.test(html), 'visible recipient fallback missing');
  return ['video_tag', 'controls', 'playsinline', 'video_source', 'classroom_cta'];
}
export function checkClassroomHtml(html) {
  for (const marker of ['id="callText"','id="field"','id="build"','id="playerPicker"','assets/classroom-ui.js']) {
    assert(html.includes(marker), 'classroom missing ' + marker);
  }
  return ['call_editor', 'field', 'draw_action', 'role_picker', 'engine_ui_import'];
}
export function checkMp4Header(bytes) {
  const data = Buffer.from(bytes);
  assert(data.length >= 32, 'video response too short');
  assert(data.toString('ascii', 4, 8) === 'ftyp', 'response is not MP4 (ftyp absent)');
  assert(data.indexOf(Buffer.from('moov')) >= 0, 'MP4 metadata atom absent from first 64 KiB');
  return { format: 'mp4', faststart_metadata_present: true, observed_bytes: data.length };
}
export function checkEngineSource(src) {
  assert(src.includes('export function') && src.includes('buildScene'), 'not the classroom engine module');
  assert(src.includes('defensivePositions') && src.includes('FLOOD'), 'missing coverage/route implementation');
  // Source presence is NOT evidence that the assignments are accurate.
  return ['engine_module', 'scene_builder', 'route_and_defense_implementation'];
}
async function get(path, opts={}) {
  const url = ORIGIN + path;
  const response = await fetch(url, {
    headers: { 'user-agent':'Evercraft-GameFabric-RecipientGate/1.0', ...opts.headers },
    signal: AbortSignal.timeout(15000),
    redirect:'follow',
  });
  assert(response.ok, path + ': HTTP ' + response.status);
  assert(response.url.startsWith(ORIGIN + '/'), path + ': redirected off expected origin');
  return response;
}
export async function runLive() {
  const checks = [];
  const [reel, classroom, engine, ui, poster] = await Promise.all([
    get(ROUTES.reel), get(ROUTES.classroom), get(ROUTES.engine), get(ROUTES.ui), get(ROUTES.poster),
  ]);
  for(const [name, response] of [['reel',reel], ['classroom',classroom]]) {
    const ct = response.headers.get('content-type') || '';
    assert(ct.includes('text/html'), name + ': not HTML (' + ct + ')');
  }
  checks.push(...checkReelHtml(await reel.text()));
  checks.push(...checkClassroomHtml(await classroom.text()));
  checks.push(...checkEngineSource(await engine.text()));
  const uiSource = await ui.text();
  assert(uiSource.includes('classroom-engine.js'), 'UI does not link to classroom engine');
  checks.push('engine_ui_link');
  const video = await get(ROUTES.video, { headers: { Range: 'bytes=0-65535' } });
  const ct = video.headers.get('content-type') || '';
  assert(!ct.includes('text/html'), 'video URL returned an HTML page');
  // Servers can serve a whole 200 response when they do not support ranges.
  assert(video.status === 200 || video.status === 206, 'unexpected range status ' + video.status);
  if(video.status===206) {
    assert(/^bytes\s+0-\d+\/\d+$/i.test(video.headers.get('content-range') || ''), 'invalid Content-Range');
  }
  const payload = Buffer.from(await video.arrayBuffer());
  assert(payload.length <= 3000000, 'unexpectedly large response for 64 KiB range probe');
  const format = checkMp4Header(payload.subarray(0, 65536));
  const fullVideo=video.status===206?Buffer.from(await (await get(ROUTES.video)).arrayBuffer()):payload;
  assert(fullVideo.length >= 100000, 'video asset is truncated');
  const videoHash=sha256(fullVideo);
  assert(videoHash===EXPECTED_MEDIA_SHA256, 'video digest mismatch: stale or swapped media');
  const posterBytes=Buffer.from(await poster.arrayBuffer());
  assert(posterBytes[0]===0xff&&posterBytes[1]===0xd8&&posterBytes[2]===0xff,'poster is not JPEG');
  const posterHash=sha256(posterBytes);
  assert(posterHash===EXPECTED_POSTER_SHA256,'poster digest mismatch: stale or swapped media');
  checks.push('video_transport', 'mp4_magic', 'mp4_metadata', 'video_sha256', 'poster_sha256', 'v29_call_and_fallback');
  return {
    schema:'evercraft.game-fabric.recipient-transport.v1',
    origin:ORIGIN,
    checked_at:new Date().toISOString(),
    status:'transport_pass',
    video_http_status:video.status,
    media_format:format,
    reel_revision:'2.9.1-review-held',
    video_sha256:videoHash,
    poster_sha256:posterHash,
    checks,
    browser_playback:'unverified',
    real_phone_playback:'unverified',
    football_assignment_correctness:'requires_coach_review',
    outbound_authority:'not_granted_by_probe',
    release_ready:false,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLive().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    console.error(JSON.stringify({schema:'evercraft.game-fabric.recipient-transport.v1',status:'failed',reason:String(error.message),browser_playback:'unverified',release_ready:false},null,2));
    process.exitCode=1;
  });
}
