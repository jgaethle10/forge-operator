import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root='public/subsea-watch/field-archive/';
const manifest=JSON.parse(fs.readFileSync(root+'sources.json','utf8'));
const html=fs.readFileSync(root+'index.html','utf8');
const script=fs.readFileSync(root+'catalog.mjs','utf8');
const immersive=fs.readFileSync('public/subsea-watch/immersive/index.html','utf8');
const sources=manifest.entries;
const byId=id=>sources.find(x=>x.id===id);
test('NOAA source ledger is deterministic, provenance-gated and has stable mission identity',()=>{
 assert.equal(manifest.schema,'evercraft.subsea.field_sources.v1');
 assert.equal(manifest.mission.id,'EX2306_DIVE02');
 assert.equal(manifest.mission.reconstruction_status,'NOT_RECONSTRUCTED');
 assert.equal(manifest.mission.alignment_status,'UNVERIFIED_NO_SYNC');
 assert.equal(manifest.mission.record_status,'source_metadata_only');
 assert.equal(new Set(sources.map(x=>x.id)).size,sources.length);
 assert.equal(sources.length,8);
 const gebco=byId('gebco-2026-global-grid');
 assert.equal(gebco.mission_id,null);
 assert.match(gebco.rights,/commercial reuse/);
 assert.match(gebco.verified_metadata,/interpolated/);
 const blue=byId('noaa-bluetopo-bathymetry');
 assert.equal(blue.mission_id,null);
 assert.match(blue.verified_metadata,/uncertainty/);
 assert.match(blue.rights,/contributor source restrictions/);
 for(const entry of sources){
  assert.ok(entry.source_page?.startsWith('https://'),'missing original source');
  assert.ok(entry.verified_metadata?.length>30,'missing evidence limits');
  assert.ok(entry.rights?.length>30,'missing usage caveat');
  assert.ok(entry.category);
  assert.ok(entry.observed_download_status);
 }
});
test('real NOAA video record is pinned to a published clip, not fictional coordinates',()=>{
 const clip=byId('noaa-ex2306-dive02-video');
 assert.equal(clip.kind,'video_segment');
 assert.equal(clip.mission_id,manifest.mission.id);
 assert.equal(clip.event_start_utc,'2023-08-25T18:30:00Z');
 assert.equal(clip.nominal_duration_s,299);
 assert.match(clip.download_url,/ncei\.noaa\.gov\/data\/oceans\/oer\/video\/EX2306\/Video\/EX2306_DIVE02_20230825\/Compressed\/EX2306_VID_20230825T183000Z_ROVHD_Low\.mp4/);
 assert.match(clip.rights,/public domain/);
 assert.match(clip.rights,/credit NOAA Ocean Exploration/);
 assert.equal(clip.category,'reference_footage_not_synchronized');
 assert.ok(!('x_m' in clip)&&!('y_m' in clip)&&!('depth_m' in clip));
});
test('actual dive archives are discoverable without inventing a synchronized 3D track',()=>{
 for(const id of ['noaa-ex2306-dive02-track','noaa-ex2306-dive02-ancillary','noaa-ex2306-dive02-ctd']){
  const entry=byId(id);
  assert.equal(entry.mission_id,manifest.mission.id);
  assert.match(entry.observed_download_status,/not_byte_verified/);
  assert.ok(entry.download_url?.includes('DIVE02'));
  assert.equal(entry.can_preview,false);
 }
 assert.match(byId('noaa-ex2306-dive02-track').file_format,/KML/);
 assert.equal(byId('ncei-bathymetry-library').mission_id,null);
 assert.equal(byId('noaa-photogrammetry-gallery').mission_id,null);
 assert.match(byId('noaa-photogrammetry-gallery').rights,/VIEW-ONLY RESEARCH/);
});
test('first-party mobile page never represents NOAA video as paired replay or certified clearance',()=>{
 for(const part of ['EX2306','Kodiak Seep','299-second','not a fabricated 3D reconstruction',
  'NOT synchronized','noindex,nofollow','NOT','original MP4','NOAA Ocean Exploration']){
  assert.ok(html.toLowerCase().includes(part.toLowerCase()),'missing disclosure '+part);
 }
 assert.match(html,/id="archive-video"/);
 assert.match(html,/playsinline controls preload="none"/);
 assert.match(html,/id="start-preview"/);
 assert.match(html,/id="source-list"/);
 assert.match(html,/src="\.\/catalog\.mjs"/);
 assert.match(immersive,/href="\.\.\/field-archive\/"/);
 assert.doesNotMatch(html,/three\.js|babylon|unpkg|cdn\.jsdelivr|youtube\.com|iframe/);
});
test('NOAA remote video is opt-in; catalog uses safe DOM text and first-party source data',()=>{
 assert.match(script,/fetch\('\.\/sources\.json'/);
 assert.match(script,/textContent=/);
 assert.match(script,/allowedUrl\(video\.download_url\)/);
 assert.match(script,/button\.addEventListener\('click'/);
 assert.match(script,/player\.src=videoSource/);
 assert.match(script,/viewer\.classList\.add\('active'\)/);
 assert.match(script,/dataset\.fieldArchive='ledger-ready'/);
 assert.doesNotMatch(script,/innerHTML|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval\(/);
});
