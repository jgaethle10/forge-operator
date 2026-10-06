import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUsdaSoilQuery,
  collectUsdaSoilAtPoint,
  pointAoiWkt
} from './soil-source.mjs';

test('USDA soil point query uses a bounded WGS84 polygon and official intersection function', () => {
  const wkt = pointAoiWkt(46.6021, -120.5059);
  assert.match(wkt, /^polygon\(\(/);
  assert.match(wkt, /-120\.505950 46\.602050/);

  const query = buildUsdaSoilQuery({ latitude: 46.6021, longitude: -120.5059 });
  assert.match(query, /SDA_Get_Mukey_from_intersection_with_WktWgs84/);
  assert.match(query, /sac\.saverest/);
  assert.match(query, /sandtotal_r/);
  assert.match(query, /claytotal_r/);
  assert.match(query, /c\.comppct_r >= 10/);
});

test('USDA soil collector preserves survey vintage and labels mapped soil as reported evidence', async () => {
  const fetchImpl = async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.match(String(init.headers['content-type']), /urlencoded/);
    assert.match(String(init.body), /JSON%2BCOLUMNNAME/);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          Table: [
            ['saversion','saverest','areasymbol','areaname','mukey','musym','muname','farmlndcl','cokey','compname','comppct_r','majcompflag','slope_r','chkey','hzname','hzdept_r','hzdepb_r','sandtotal_r','silttotal_r','claytotal_r','dbthirdbar_r','wthirdbar_r','wfifteenbar_r'],
            ['18','2025-08-29T16:57:00','WA999','Example Survey','123','1','Example loam','Prime farmland','456','Example soil','80','Yes','2','789','A','0','20','40','40','20','1.3','25','10'],
            ['18','2025-08-29T16:57:00','WA999','Example Survey','123','1','Example loam','Prime farmland','456','Example soil','80','Yes','2','790','B','20','60','35','35','30','1.4','22','11']
          ]
        });
      }
    };
  };

  const result = await collectUsdaSoilAtPoint({
    latitude: 46.6021,
    longitude: -120.5059,
    regionKeys: ['yakima-wa'],
    retrievedAt: '2026-10-06T18:00:00.000Z',
    fetchImpl
  });

  assert.equal(result.mapunit_count, 1);
  assert.equal(result.observation.evidence_state, 'reported');
  assert.equal(result.observation.observed_at, '2025-08-29T16:57:00.000Z');
  assert.equal(result.observation.region_keys[0], 'yakima-wa');
  assert.equal(result.observation.facts.mapunits[0].components[0].horizons.length, 2);
  assert.equal(result.observation.metadata.field_verification_required_for_consequential_use, true);
  assert.match(result.observation.facts.source_semantics, /not a field soil test/i);
});

test('USDA soil collector rejects missing or out-of-range site coordinates', async () => {
  await assert.rejects(
    () => collectUsdaSoilAtPoint({ latitude: 120, longitude: -120 }),
    /latitude/
  );
  await assert.rejects(
    () => collectUsdaSoilAtPoint({ latitude: 46, longitude: -220 }),
    /longitude/
  );
});
