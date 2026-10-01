const FOMC_DECISION_DATES = Object.freeze([
  "2025-10-29",
  "2025-12-10",
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
]);

const CPI_RELEASE_DATES = Object.freeze([
  "2025-10-24",
  "2025-12-18",
  "2026-01-13",
  "2026-02-13",
  "2026-03-11",
  "2026-04-10",
  "2026-05-12",
  "2026-06-10",
  "2026-07-14",
  "2026-08-12",
  "2026-09-11",
]);

export const OFFICIAL_MACRO_CALENDAR_PROVENANCE = Object.freeze({
  fomc: {
    authority: "Board of Governors of the Federal Reserve System",
    source: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    dates: [...FOMC_DECISION_DATES],
  },
  cpi: {
    authority: "U.S. Bureau of Labor Statistics",
    source: "https://www.bls.gov/schedule/news_release/cpi.htm",
    shutdown_revision_source:
      "https://www.bls.gov/bls/2025-lapse-revised-release-dates.htm",
    dates: [...CPI_RELEASE_DATES],
    note:
      "September 2025 CPI was released 2025-10-24; October 2025 CPI was not published; November 2025 CPI was released 2025-12-18.",
  },
});

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(row, sign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

const NY_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    NY_DATE.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dayDistance(a, b) {
  const left = Date.parse(a + "T12:00:00Z");
  const right = Date.parse(b + "T12:00:00Z");
  return Math.round(Math.abs(left - right) / 86400000);
}

function nearAny(date, dates, days) {
  if (!date) return false;
  return dates.some((candidate) => dayDistance(date, candidate) <= days);
}

function earningsRelated(row) {
  const form = String(row?.source_form || "").toUpperCase();
  if (form === "10-Q" || form === "10-K") return true;
  const items = Array.isArray(row?.sec_items)
    ? row.sec_items.map((item) => String(item).trim())
    : [];
  return form === "8-K" && items.includes("2.02");
}

function summarize(rows, sign, costBps) {
  const values = rows.map((row) => signedNet(row, sign, costBps));
  const origins = [...new Set(rows.map((row) => row.origin_entity_ref).filter(Boolean))];
  return {
    observations: rows.length,
    distinct_origins: origins.length,
    mean_signed_net: mean(values),
    positive_rate: values.length
      ? values.filter((value) => value > 0).length / values.length
      : 0,
  };
}

export function evaluateEventContamination(candidate, rows, {
  transaction_cost_bps = 5,
  macro_proximity_days = 1,
  minimum_clean_events = 20,
  minimum_clean_origins = 5,
} = {}) {
  const sign = expectedSign(candidate);
  const tagged = rows.map((row) => {
    const eventDate = dateKey(row.observed_at);
    const fomc = nearAny(eventDate, FOMC_DECISION_DATES, macro_proximity_days);
    const cpi = nearAny(eventDate, CPI_RELEASE_DATES, macro_proximity_days);
    const earnings = earningsRelated(row);
    return {
      row,
      event_date: eventDate,
      fomc_contaminated: fomc,
      cpi_contaminated: cpi,
      major_macro_contaminated: fomc || cpi,
      earnings_related: earnings,
      any_contamination: fomc || cpi || earnings,
    };
  });

  const all = summarize(rows, sign, transaction_cost_bps);
  const macroCleanRows = tagged
    .filter((item) => !item.major_macro_contaminated)
    .map((item) => item.row);
  const earningsCleanRows = tagged
    .filter((item) => !item.earnings_related)
    .map((item) => item.row);
  const fullyCleanRows = tagged
    .filter((item) => !item.any_contamination)
    .map((item) => item.row);

  const macroClean = summarize(macroCleanRows, sign, transaction_cost_bps);
  const earningsClean = summarize(earningsCleanRows, sign, transaction_cost_bps);
  const fullyClean = summarize(fullyCleanRows, sign, transaction_cost_bps);

  const checks = {
    macro_clean_events_at_least_minimum:
      macroClean.observations >= minimum_clean_events,
    macro_clean_origins_at_least_minimum:
      macroClean.distinct_origins >= minimum_clean_origins,
    survives_macro_calendar_exclusion:
      macroClean.observations >= minimum_clean_events &&
      macroClean.mean_signed_net > 0,
    earnings_clean_events_at_least_minimum:
      earningsClean.observations >= minimum_clean_events,
    earnings_clean_origins_at_least_minimum:
      earningsClean.distinct_origins >= minimum_clean_origins,
    survives_earnings_event_exclusion:
      earningsClean.observations >= minimum_clean_events &&
      earningsClean.mean_signed_net > 0,
    fully_clean_events_at_least_minimum:
      fullyClean.observations >= minimum_clean_events,
    fully_clean_origins_at_least_minimum:
      fullyClean.distinct_origins >= minimum_clean_origins,
    survives_combined_contamination_exclusion:
      fullyClean.observations >= minimum_clean_events &&
      fullyClean.mean_signed_net > 0,
  };

  const enoughData =
    checks.macro_clean_events_at_least_minimum &&
    checks.earnings_clean_events_at_least_minimum &&
    checks.fully_clean_events_at_least_minimum;

  return {
    schema: "evercraft.daytrade.edge-event-contamination-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    macro_proximity_days,
    original: all,
    macro_clean: macroClean,
    earnings_clean: earningsClean,
    fully_clean: fullyClean,
    contamination_counts: {
      fomc: tagged.filter((item) => item.fomc_contaminated).length,
      cpi: tagged.filter((item) => item.cpi_contaminated).length,
      major_macro: tagged.filter((item) => item.major_macro_contaminated).length,
      earnings_related: tagged.filter((item) => item.earnings_related).length,
      any: tagged.filter((item) => item.any_contamination).length,
      item_2_02: tagged.filter((item) =>
        Array.isArray(item.row.sec_items) &&
        item.row.sec_items.map(String).includes("2.02")
      ).length,
    },
    contamination_rates: {
      major_macro: tagged.length
        ? tagged.filter((item) => item.major_macro_contaminated).length / tagged.length
        : 0,
      earnings_related: tagged.length
        ? tagged.filter((item) => item.earnings_related).length / tagged.length
        : 0,
      any: tagged.length
        ? tagged.filter((item) => item.any_contamination).length / tagged.length
        : 0,
    },
    checks,
    contamination_status: !enoughData
      ? "CONTAMINATION_INSUFFICIENT_CLEAN_SAMPLE"
      : Object.values(checks).every(Boolean)
        ? "CONTAMINATION_ROBUST_DIAGNOSTIC"
        : "CONTAMINATION_FRAGILE_DIAGNOSTIC",
    official_calendar_provenance: OFFICIAL_MACRO_CALENDAR_PROVENANCE,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runEventContaminationLab(report, options = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );
  const measurements = report?.measurements || [];
  if (candidates.length && !measurements.length) {
    throw new Error("edge_event_contamination_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateEventContamination(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const statusCounts = {};
  for (const review of reviews) {
    statusCounts[review.contamination_status] =
      Number(statusCounts[review.contamination_status] || 0) + 1;
  }

  return {
    schema: "evercraft.daytrade.edge-event-contamination-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    status_counts: statusCounts,
    reviews,
    official_calendar_provenance: OFFICIAL_MACRO_CALENDAR_PROVENANCE,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
