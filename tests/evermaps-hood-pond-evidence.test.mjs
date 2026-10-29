import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOOD_POND_SOURCE, HOOD_POND_BASELINE, normalizeHoodPondNotice,
  fetchHoodPondEvidence, createOwnedHoodPondService
} from '../systemia/evermaps/hood-pond-evidence.mjs';
import {registerEvermapsIncidentRoutes} from '../systemia/evermaps/http.mjs';

const NOW = Date.parse('2026-10-28T20:00:00Z');
const SOURCE_NOTICE = 'https://volcanoes.usgs.gov/hans-public/notice/DOI-USGS-CVO-2026-10-23T14%3A05%3A07%2B00%3A00';
const notice = (sectionSummary, overrides = {}) => [{
  obs: 'cvo', sentUtc: '2026-10-23',
  noticeId: 'DOI-USGS-CVO-2026-10-23T14:05:07+00:00',
  noticeUrl: SOURCE_NOTICE,
  noticeSections: [{
    vName: 'Cascade Range', alertLevel: 'NORMAL', colorCode: 'GREEN',
    summary: sectionSummary
  }], ...overrides
}];
const pondText = '<p>A seasonal meltwater pond at the base of Coalman Glacier is larger than usual.</p>';
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: {'Content-Type': 'application/json'}
});

test('USGS feed is fixed, historically sourced, and reports observation uncertainty', () => {
  assert.equal(new URL(HOOD_POND_SOURCE.endpoint).hostname, 'volcanoes.usgs.gov');
  assert.equal(HOOD_POND_BASELINE.estimated_volume_cubic_meters, 50000);
  assert.equal(HOOD_POND_BASELINE.volume_is_measured, false);
  assert.equal(HOOD_POND_BASELINE.current_conditions_from_baseline, false);
  assert.equal(HOOD_POND_BASELINE.modeled_inundation_area_available, false);
});

test('pond and volcanic activity are independent statuses with provenance', () => {
  const event = normalizeHoodPondNotice(notice(pondText), new Date(NOW).toISOString());
  assert.equal(event.current_notice.official_volcano_alert_level, 'NORMAL');
  assert.equal(event.current_notice.official_aviation_color_code, 'GREEN');
  assert.equal(event.current_notice.pond_discussed, true);
  assert.equal(event.current_notice.pond_reporting_state, 'MENTIONED_IN_LATEST_CVO_NOTICE');
  assert.equal(event.current_notice.published_date_utc, '2026-10-23');
  assert.equal(event.guarantees.volcano_alert_is_pond_safety_status, false);
  assert.equal(event.guarantees.computed_debris_flow_inundation, false);
  assert.ok(!event.current_notice.excerpt.includes('<p>'));
});

test('later bulletin omitting pond is NOT proof of pond resolution', () => {
  const event = normalizeHoodPondNotice(notice('Background volcanism remains normal.', {
    sentUtc: '2026-10-30'
  }), new Date(NOW).toISOString());
  assert.equal(event.current_notice.pond_discussed, false);
  assert.equal(event.current_notice.pond_reporting_state, 'NOT_MENTIONED_NOT_RESOLVED');
  assert.equal(event.current_notice.excerpt, null);
  assert.equal(event.historical_baseline.current_conditions_from_baseline, false);
});

test('malformed and unofficial notices fail closed', () => {
  assert.throws(() => normalizeHoodPondNotice({}), /HOOD_POND_INVALID_FEED/);
  assert.throws(() => normalizeHoodPondNotice([]), /HOOD_POND_NO_CVO_NOTICE/);
  assert.throws(() => normalizeHoodPondNotice(notice(pondText, {noticeUrl:'https://example.com/'})),
    /HOOD_POND_UNTRUSTED_NOTICE_URL/);
  assert.throws(() => normalizeHoodPondNotice(notice(pondText, {
    noticeSections:[{vName:'Cascade Range', alertLevel:'UNKNOWN', colorCode:'GREEN', summary:pondText}]
  })), /HOOD_POND_VOLCANO_STATUS_UNVERIFIED/);
});

test('official feed fetch and source errors are represented independently', async () => {
  const result = await fetchHoodPondEvidence({
    fetchImpl: async () => jsonResponse(notice(pondText)),
    checkedAt: new Date(NOW).toISOString()
  });
  assert.equal(result.event_id, 'usgs-hood-coalman-pond-2026');
  await assert.rejects(fetchHoodPondEvidence({
    fetchImpl: async () => jsonResponse({error:'broken'})
  }), /HOOD_POND_INVALID_FEED/);
  await assert.rejects(fetchHoodPondEvidence({
    fetchImpl: async () => new Response('', {status:503})
  }), /HOOD_POND_UPSTREAM_HTTP_503/);
});

test('cached checks coalesce and expired upstream failure removes live source status', async () => {
  let now=NOW, requests=0;
  let fail=false;
  const service = createOwnedHoodPondService({
    clock: () => now, cacheMs: 1000,
    fetchImpl: async () => {
      requests++;
      return fail ? new Response('', {status:503}) : jsonResponse(notice(pondText));
    }
  });
  const [a,b]=await Promise.all([service.read(),service.read()]);
  assert.equal(a,b);
  assert.equal(requests,1);
  await service.read();
  assert.equal(requests,1);
  assert.equal(service.health().state,'fresh');
  now+=1500; fail=true;
  await assert.rejects(service.read(), /HOOD_POND_UPSTREAM_HTTP_503/);
  assert.equal(service.health().state,'unavailable');
});

test('owned HTTP route displays source evidence and 503 without misleading historical fallback', async () => {
  const routes=new Map();
  const app={get:(path,...handlers)=>routes.set(path,handlers)};
  let failure=false;
  registerEvermapsIncidentRoutes(app,{
    service:{health:()=>({state:'not_loaded'}),read:async()=>({records:[]})},
    environmentalService:{
      read: async()=>{if(failure)throw Error('down');return normalizeHoodPondNotice(notice(pondText));}
    }
  });
  const respond=()=>{
    let status=200,payload=null;
    const res={
      setHeader:()=>res,
      status:(s)=>{status=s;return res},
      json:(v)=>{payload=v;return res}
    };
    return {res,getStatus:()=>status,getPayload:()=>payload};
  };
  let r=respond();
  await routes.get('/api/evermaps/events/mount-hood-pond')[1]({},r.res);
  assert.equal(r.getStatus(),200);
  assert.equal(r.getPayload().current_notice.pond_discussed,true);
  failure=true; r=respond();
  await routes.get('/api/evermaps/events/mount-hood-pond')[1]({},r.res);
  assert.equal(r.getStatus(),503);
  assert.equal(r.getPayload().status,'SOURCE_UNAVAILABLE');
  assert.equal(r.getPayload().current_notice,null);
});
