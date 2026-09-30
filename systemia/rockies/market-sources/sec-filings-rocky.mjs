import crypto from "node:crypto";

export const DEFAULT_SEC_RESEARCH_UNIVERSE = Object.freeze([
  { ticker: "AAPL", rockies_range: "independent_scouts" },
  { ticker: "NVDA", rockies_range: "semiconductors_compute" },
  { ticker: "AMD", rockies_range: "semiconductors_compute" },
  { ticker: "MSFT", rockies_range: "ai_models" },
  { ticker: "GOOGL", rockies_range: "ai_models" },
  { ticker: "META", rockies_range: "ai_models" },
  { ticker: "AMZN", rockies_range: "ai_models" },
  { ticker: "TSLA", rockies_range: "industrial_manufacturing" },
]);

const RANGE_DOMAINS = Object.freeze({
  semiconductors_compute: ["semiconductors", "ai", "infrastructure"],
  ai_models: ["ai", "science"],
  industrial_manufacturing: ["industrial", "supply_chain"],
  independent_scouts: ["general", "economy"],
});

const FORM_ANOMALY = Object.freeze({
  "8-K": 0.60,
  "10-Q": 0.45,
  "10-K": 0.40,
});

function hash(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex").slice(0,24);
}

function requiredText(value, name) {
  const out = String(value || "").trim();
  if (!out) throw new Error(name + "_required");
  return out;
}

function easternOffsetMinutes(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (wallAsUtc - date.getTime()) / 60000;
}

export function parseSecAcceptanceDateTime(value) {
  const text = requiredText(value, "acceptance_datetime");

  if (/^\d{14}$/.test(text)) {
    const year = Number(text.slice(0,4));
    const month = Number(text.slice(4,6));
    const day = Number(text.slice(6,8));
    const hour = Number(text.slice(8,10));
    const minute = Number(text.slice(10,12));
    const second = Number(text.slice(12,14));
    const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);

    let guess = new Date(naiveUtc);
    let offset = easternOffsetMinutes(guess);
    guess = new Date(naiveUtc - offset * 60000);
    offset = easternOffsetMinutes(guess);
    return new Date(naiveUtc - offset * 60000).toISOString();
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) throw new Error("acceptance_datetime_invalid");
  return parsed.toISOString();
}

function filingUrl(cik, accessionNumber, primaryDocument) {
  const cikBare = String(Number(cik));
  const accessionBare = String(accessionNumber || "").replace(/-/g, "");
  const doc = String(primaryDocument || "").trim();
  if (!cikBare || !accessionBare || !doc) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cikBare}/${accessionBare}/${doc}`;
}

function columnsToRows(recent = {}) {
  const keys = Object.keys(recent);
  const count = Math.max(0, ...keys.map((key) => Array.isArray(recent[key]) ? recent[key].length : 0));
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(Object.fromEntries(keys.map((key) => [key, Array.isArray(recent[key]) ? recent[key][i] : null])));
  }
  return rows;
}

export function secFilingToRockyObservation({
  ticker,
  company_title,
  cik,
  rockies_range,
  filing,
  publication_delay_buffer_minutes = 10,
} = {}) {
  const form = requiredText(filing?.form, "filing_form").toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(FORM_ANOMALY, form)) return null;

  const acceptanceAt = parseSecAcceptanceDateTime(filing.acceptanceDateTime);
  const modeledPublicAt = new Date(
    new Date(acceptanceAt).getTime() + publication_delay_buffer_minutes * 60_000
  ).toISOString();

  const accession = requiredText(filing.accessionNumber, "accession_number");
  const sourceRef = filingUrl(cik, accession, filing.primaryDocument) ||
    `sec:accession:${accession}`;

  const domains = RANGE_DOMAINS[rockies_range] || ["general", "economy"];
  const items = String(filing.items || "").split(",").map((x) => x.trim()).filter(Boolean);

  return {
    schema: "evercraft.context.observation.v1",
    observation_id: "ctxobs:sec:" + hash({ ticker, accession }),
    source_system: "rockies",
    source_family: "sec_filings",
    observed_at: modeledPublicAt,
    region_keys: ["us"],
    domains,
    kind: "sec_" + form.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    evidence_state: "verified",
    reliability: 0.99,
    anomaly_score: FORM_ANOMALY[form],
    summary: `${ticker} ${form} filing accepted by SEC EDGAR.`,
    provenance_refs: [sourceRef],
    correlation_keys: [
      `market::${ticker.toLowerCase()}::sec-${form.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ],
    facts: {
      ticker,
      company_title,
      cik: String(cik),
      accession_number: accession,
      form,
      filing_date: filing.filingDate || null,
      report_date: filing.reportDate || null,
      items,
      primary_document: filing.primaryDocument || null,
    },
    measurements: [],
    metadata: {
      rockies_range,
      market_symbols: [ticker],
      origin_entity_ref: `sec:cik:${String(cik).padStart(10,"0")}`,
      authority_class: "official_regulatory_filing",
      sec_acceptance_at: acceptanceAt,
      market_observation_time_basis: "sec_acceptance_plus_publication_delay_buffer",
      publication_delay_buffer_minutes,
      public_availability_exact_time_known: false,
    },
  };
}

export function observationsFromSecSubmissions({
  ticker,
  rockies_range,
  submissions,
  forms = ["8-K","10-Q","10-K"],
  lookback_days = 120,
  now = new Date(),
  publication_delay_buffer_minutes = 10,
} = {}) {
  const allowed = new Set(forms.map((x) => String(x).toUpperCase()));
  const cutoff = now.getTime() - Number(lookback_days) * 86400000;
  const recent = columnsToRows(submissions?.filings?.recent || {});
  const rows = [];

  for (const filing of recent) {
    const form = String(filing.form || "").toUpperCase();
    if (!allowed.has(form)) continue;
    let acceptance;
    try {
      acceptance = parseSecAcceptanceDateTime(filing.acceptanceDateTime);
    } catch {
      continue;
    }
    if (new Date(acceptance).getTime() < cutoff) continue;

    const observation = secFilingToRockyObservation({
      ticker,
      company_title: submissions?.name || ticker,
      cik: submissions?.cik,
      rockies_range,
      filing,
      publication_delay_buffer_minutes,
    });
    if (observation) rows.push(observation);
  }

  return rows.sort((a,b) => a.observed_at.localeCompare(b.observed_at));
}

async function fetchJson(url, { userAgent, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": userAgent,
      "accept": "application/json",
      "accept-encoding": "gzip, deflate",
    },
  });
  if (!response.ok) throw new Error(`sec_http_${response.status}`);
  return response.json();
}

export async function fetchSecTickerMap({
  userAgent = process.env.EVERCRAFT_SEC_USER_AGENT ||
    "Evercraft-EdgeLab/1.0 (https://systemiacommandcenters.com)",
  fetchImpl = fetch,
} = {}) {
  return fetchJson("https://www.sec.gov/files/company_tickers.json", {
    userAgent,
    fetchImpl,
  });
}

export function tickerMapIndex(payload) {
  const out = new Map();
  for (const row of Object.values(payload || {})) {
    const ticker = String(row?.ticker || "").trim().toUpperCase();
    const cik = Number(row?.cik_str);
    if (!ticker || !Number.isFinite(cik)) continue;
    out.set(ticker, {
      ticker,
      cik,
      title: String(row?.title || ticker),
    });
  }
  return out;
}

export async function fetchSecSubmissions(cik, {
  userAgent = process.env.EVERCRAFT_SEC_USER_AGENT ||
    "Evercraft-EdgeLab/1.0 (https://systemiacommandcenters.com)",
  fetchImpl = fetch,
} = {}) {
  const padded = String(Number(cik)).padStart(10,"0");
  return fetchJson(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    userAgent,
    fetchImpl,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function buildSecRockyObservationBatch({
  universe = DEFAULT_SEC_RESEARCH_UNIVERSE,
  forms = ["8-K","10-Q","10-K"],
  lookback_days = 120,
  publication_delay_buffer_minutes = 10,
  request_interval_ms = 300,
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const tickerPayload = await fetchSecTickerMap({ fetchImpl });
  const tickerIndex = tickerMapIndex(tickerPayload);
  const observations = [];
  const misses = [];

  for (let i = 0; i < universe.length; i++) {
    const spec = universe[i];
    const ticker = String(spec.ticker || "").toUpperCase();
    const mapped = tickerIndex.get(ticker);
    if (!mapped) {
      misses.push({ ticker, reason: "sec_ticker_not_found" });
      continue;
    }

    if (i > 0 && request_interval_ms > 0) await sleep(request_interval_ms);
    const submissions = await fetchSecSubmissions(mapped.cik, { fetchImpl });
    observations.push(...observationsFromSecSubmissions({
      ticker,
      rockies_range: spec.rockies_range || "independent_scouts",
      submissions,
      forms,
      lookback_days,
      now,
      publication_delay_buffer_minutes,
    }));
  }

  return {
    schema: "evercraft.rockies.sec-market-observation-batch.v1",
    generated_at: new Date().toISOString(),
    lookback_days,
    forms,
    publication_delay_buffer_minutes,
    universe: universe.map((x) => ({ ...x })),
    observation_count: observations.length,
    observations,
    misses,
    source_family: "sec_filings",
    source_authority: "U.S. Securities and Exchange Commission EDGAR",
    live_trade_authority: false,
  };
}
