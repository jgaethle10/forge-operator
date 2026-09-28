import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

export const SOURCES = Object.freeze({
  earthquakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  volcanoes: 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes',
  pubmedSearch: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
  pubmedSummary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
});

const MEDICAL_QUERY = [
  'cancer[Title/Abstract]',
  '"Parkinson Disease"[MeSH Terms]',
  'pregnancy[MeSH Terms]',
  '"public health"[Title/Abstract]',
  'genomic*[Title/Abstract]',
  '"One Health"[Title/Abstract]'
].join(' OR ');

async function fetchJson(url, fetcher, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { 'user-agent': 'Evercraft-KAIDANCE/1.0 public-evidence-watch' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return { ok: true, value: await response.json() };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function quakeSummary(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const rows = features.map((item) => ({
    id: item?.id || null,
    magnitude: Number.isFinite(Number(item?.properties?.mag)) ? Number(item.properties.mag) : null,
    place: item?.properties?.place || null,
    time: item?.properties?.time || null,
    url: item?.properties?.url || null
  }));
  const magnitudes = rows.map((x) => x.magnitude).filter(Number.isFinite);
  return {
    count: rows.length,
    max_magnitude: magnitudes.length ? Math.max(...magnitudes) : null,
    significant_count: rows.filter((x) => Number(x.magnitude) >= 4.5).length,
    newest: rows.sort((a, b) => Number(b.time || 0) - Number(a.time || 0)).slice(0, 10)
  };
}

function volcanoSummary(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.volcanoes)
      ? payload.volcanoes
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return {
    elevated_count: rows.length,
    elevated: rows.slice(0, 50).map((row) => ({
      name: row?.volcanoName || row?.volcano_name || row?.name || null,
      volcano_code: row?.volcanoCd || row?.volcano_code || row?.vnum || null,
      color_code: row?.colorCode || row?.color_code || null,
      alert_level: row?.alertLevel || row?.alert_level || null
    }))
  };
}

function pubmedUrls() {
  const search = new URL(SOURCES.pubmedSearch);
  search.searchParams.set('db', 'pubmed');
  search.searchParams.set('term', `(${MEDICAL_QUERY})`);
  search.searchParams.set('reldate', '2');
  search.searchParams.set('datetype', 'edat');
  search.searchParams.set('retmax', '20');
  search.searchParams.set('sort', 'pub+date');
  search.searchParams.set('retmode', 'json');
  return { search };
}

function pubmedSummary(searchPayload) {
  const result = searchPayload?.esearchresult || {};
  return {
    total_recent_matches: Number(result.count || 0),
    pmids: Array.isArray(result.idlist) ? result.idlist.slice(0, 20) : []
  };
}

function normalizeDocs(payload) {
  const result = payload?.result || {};
  const uids = Array.isArray(result.uids) ? result.uids : [];
  return uids.slice(0, 20).map((uid) => {
    const row = result[uid] || {};
    return {
      pmid: uid,
      title: row.title || null,
      source: row.source || null,
      pubdate: row.pubdate || null,
      authors: Array.isArray(row.authors) ? row.authors.slice(0, 6).map((x) => x?.name).filter(Boolean) : []
    };
  });
}

export async function runScienceHazardWatch({
  fetcher = globalThis.fetch,
  now = new Date(),
  outDir = path.join(process.cwd(), 'artifacts/science-hazard-watch')
} = {}) {
  if (typeof fetcher !== 'function') throw new Error('fetcher_required');

  const [quakeRaw, volcanoRaw] = await Promise.all([
    fetchJson(SOURCES.earthquakes, fetcher),
    fetchJson(SOURCES.volcanoes, fetcher)
  ]);

  const { search } = pubmedUrls();
  const pubmedRaw = await fetchJson(search.toString(), fetcher);
  let docsRaw = { ok: true, value: { result: { uids: [] } } };
  const medical = pubmedRaw.ok ? pubmedSummary(pubmedRaw.value) : { total_recent_matches: 0, pmids: [] };
  if (pubmedRaw.ok && medical.pmids.length) {
    const summary = new URL(SOURCES.pubmedSummary);
    summary.searchParams.set('db', 'pubmed');
    summary.searchParams.set('id', medical.pmids.slice(0, 20).join(','));
    summary.searchParams.set('retmode', 'json');
    docsRaw = await fetchJson(summary.toString(), fetcher);
  }

  const lanes = {
    earthquakes: quakeRaw.ok
      ? { status: 'observed', source: SOURCES.earthquakes, ...quakeSummary(quakeRaw.value) }
      : { status: 'held', source: SOURCES.earthquakes, reason: quakeRaw.error },
    volcanoes: volcanoRaw.ok
      ? { status: 'observed', source: SOURCES.volcanoes, ...volcanoSummary(volcanoRaw.value) }
      : { status: 'held', source: SOURCES.volcanoes, reason: volcanoRaw.error },
    medical_research: pubmedRaw.ok
      ? {
          status: docsRaw.ok ? 'observed' : 'observed_with_summary_hold',
          source: SOURCES.pubmedSearch,
          query_scope: 'recent cancer, Parkinson disease, pregnancy, public health, genomics, and One Health literature',
          ...medical,
          documents: docsRaw.ok ? normalizeDocs(docsRaw.value) : [],
          summary_hold: docsRaw.ok ? null : docsRaw.error
        }
      : { status: 'held', source: SOURCES.pubmedSearch, reason: pubmedRaw.error }
  };

  const sourceRows = Object.entries(lanes);
  const held = sourceRows.filter(([, lane]) => String(lane.status).includes('held')).length;
  const admitted = sourceRows.length - held;
  const body = {
    schema: 'evercraft.kaidance.science-hazard-watch.v1',
    observed_at: now.toISOString(),
    evidence_policy: 'official-public-sources-only; observations-are-not-predictions; medical-literature-is-research-not-personal-medical-advice',
    lanes
  };
  const report = { ...body, receipt_hash: `sha256:${sha(JSON.stringify(body))}` };
  const snapshot = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: report.receipt_hash,
    observed_at: now.toISOString(),
    counts: { scanned: sourceRows.length, changed: sourceRows.length, admitted, held },
    evidence_refs: sourceRows.map(([key, lane]) => `${key}:${lane.source}`)
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'mission-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
  return { report, snapshot };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runScienceHazardWatch();
  console.log(JSON.stringify({
    ok: true,
    schema: result.report.schema,
    earthquake_count: result.report.lanes.earthquakes.count ?? null,
    elevated_volcano_count: result.report.lanes.volcanoes.elevated_count ?? null,
    recent_medical_matches: result.report.lanes.medical_research.total_recent_matches ?? null,
    held: result.snapshot.counts.held,
    receipt_hash: result.report.receipt_hash
  }));
}
