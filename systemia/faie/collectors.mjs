import { pollNwsActiveAlerts } from '../sentinel/sources/nws-alerts.mjs';
import { pollUsgsWaterLatest } from '../sentinel/sources/usgs-water.mjs';
import { pollNwpsRiverGauges } from '../sentinel/sources/nwps-rivers.mjs';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function csv(value, limit = 100) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map(clean)
      .filter(Boolean)
  )].slice(0, limit);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function faieCollectorConfigFromEnv(env = process.env) {
  return {
    enabled: bool(env.FAIE_OFFICIAL_COLLECTORS_ENABLED, true),
    nws_enabled: bool(env.FAIE_NWS_ENABLED, true),
    nws_area: clean(env.FAIE_NWS_AREA || '').toUpperCase() || null,
    usgs_water_sites: csv(env.FAIE_USGS_WATER_SITES, 100),
    usgs_water_parameters: csv(env.FAIE_USGS_WATER_PARAMETERS || '00060,00065', 20),
    nwps_gauges: csv(env.FAIE_NWPS_GAUGES, 50)
  };
}

function domainsForSentinelObservation(row = {}) {
  const kind = clean(row.kind).toLowerCase();
  const domain = clean(row.domain).toLowerCase();

  if (domain === 'hydrology') return ['water'];
  if (domain === 'weather') return ['weather'];
  if (domain === 'environmental') return ['environment'];
  if (domain === 'infrastructure') return ['infrastructure'];
  if (domain === 'aviation') return ['aviation', 'transport'];

  if (domain === 'emergency_report') {
    if (/flood|river|hydro|water/.test(kind)) return ['weather', 'water', 'disaster'];
    if (/fire|smoke|red_flag/.test(kind)) return ['weather', 'environment', 'earth_hazards'];
    if (/heat|freeze|frost|cold|snow|ice/.test(kind)) return ['weather', 'climate', 'agriculture'];
    return ['weather', 'disaster'];
  }

  return ['general'];
}

export function sentinelObservationToFaie(row = {}) {
  const observationId = clean(row.observation_id);
  if (!observationId) throw new TypeError('sentinel observation_id is required');

  const observedAt = clean(row.created_at || row.observed_at);
  if (!observedAt || !Number.isFinite(new Date(observedAt).getTime())) {
    throw new TypeError('sentinel observation timestamp is required');
  }

  const provenanceRefs = [
    row.provenance_ref,
    ...(Array.isArray(row.provenance_refs) ? row.provenance_refs : [])
  ].map(clean).filter(Boolean);

  return {
    observation_id: observationId,
    source_system: 'systemia_sentinel_official',
    source_family: clean(row.source_family || 'sentinel-official-source'),
    observed_at: observedAt,
    region_keys: [row.region_key, row.region_group].map(clean).filter(Boolean),
    domains: domainsForSentinelObservation(row),
    kind: clean(row.kind || 'official_source_observation'),
    evidence_state: clean(row.evidence_state || 'reported').toLowerCase(),
    reliability: Number(row.reliability ?? 0.7),
    anomaly_score: Number(row.anomaly_score ?? 0),
    summary: clean(row.summary || row.kind || 'Official source observation'),
    provenance_refs: [...new Set(provenanceRefs)],
    correlation_keys: [
      clean(row.independence_group),
      clean(row.region_group),
      clean(row.kind)
    ].filter(Boolean),
    facts: {
      hazard_state: clean(row.hazard_state) || null,
      independence_group: clean(row.independence_group) || null,
      sentinel_domain: clean(row.domain) || null,
      metric_value: Number.isFinite(Number(row.metric_value)) ? Number(row.metric_value) : null,
      metric_metadata: row.metric_metadata && typeof row.metric_metadata === 'object'
        ? structuredClone(row.metric_metadata)
        : null
    },
    metadata: {
      bridge: 'faie_sentinel_official_source_bridge',
      adapter_receipt: row.adapter_receipt && typeof row.adapter_receipt === 'object'
        ? structuredClone(row.adapter_receipt)
        : null
    }
  };
}

function disabledReceipt(sourceId, reason, checkedAt) {
  return {
    source_id: sourceId,
    status: 'disabled',
    checked_at: checkedAt,
    item_count: 0,
    reason
  };
}

export async function collectFaieOfficialSources({
  fetchImpl = globalThis.fetch,
  checkedAt = new Date().toISOString(),
  config = faieCollectorConfigFromEnv(),
  pollers = {
    nws: pollNwsActiveAlerts,
    usgsWater: pollUsgsWaterLatest,
    nwps: pollNwpsRiverGauges
  }
} = {}) {
  if (!config?.enabled) {
    return {
      schema: 'evercraft.faie.official-collector-run.v1',
      generated_at: checkedAt,
      observations: [],
      receipts: [disabledReceipt('faie-official-collectors', 'collectors_disabled', checkedAt)]
    };
  }

  const jobs = [];

  if (config.nws_enabled) {
    jobs.push({
      id: 'nws-active-alerts',
      run: () => pollers.nws({
        area: config.nws_area || null,
        fetchImpl,
        checkedAt
      })
    });
  } else {
    jobs.push({
      id: 'nws-active-alerts',
      disabled: disabledReceipt('nws-active-alerts', 'nws_disabled', checkedAt)
    });
  }

  if ((config.usgs_water_sites || []).length) {
    jobs.push({
      id: 'usgs-water-latest-continuous',
      run: () => pollers.usgsWater({
        monitoringLocationIds: config.usgs_water_sites,
        parameterCodes: (config.usgs_water_parameters || []).length
          ? config.usgs_water_parameters
          : ['00060', '00065'],
        fetchImpl,
        checkedAt
      })
    });
  } else {
    jobs.push({
      id: 'usgs-water-latest-continuous',
      disabled: disabledReceipt('usgs-water-latest-continuous', 'no_monitoring_locations_configured', checkedAt)
    });
  }

  if ((config.nwps_gauges || []).length) {
    jobs.push({
      id: 'nwps-river-gauges',
      run: () => pollers.nwps({
        gaugeIds: config.nwps_gauges,
        fetchImpl,
        checkedAt
      })
    });
  } else {
    jobs.push({
      id: 'nwps-river-gauges',
      disabled: disabledReceipt('nwps-river-gauges', 'no_gauges_configured', checkedAt)
    });
  }

  const observations = [];
  const receipts = [];

  for (const job of jobs) {
    if (job.disabled) {
      receipts.push(job.disabled);
      continue;
    }

    try {
      const result = await job.run();
      receipts.push({
        ...(result?.receipt || {}),
        source_id: result?.receipt?.source_id || job.id
      });
      for (const row of result?.observations || []) {
        try {
          observations.push(sentinelObservationToFaie(row));
        } catch (error) {
          receipts.push({
            source_id: job.id,
            status: 'partial',
            checked_at: checkedAt,
            item_count: 0,
            reason: 'observation_normalization_failed',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } catch (error) {
      receipts.push({
        source_id: job.id,
        status: 'error',
        checked_at: checkedAt,
        item_count: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    schema: 'evercraft.faie.official-collector-run.v1',
    generated_at: checkedAt,
    observations,
    receipts
  };
}
