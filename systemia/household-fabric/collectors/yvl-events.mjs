import { createHash } from 'node:crypto';

const DEFAULT_SOURCE_URL = 'https://www.yvl.org/events/';
const DEFAULT_SOURCE_NAME = 'Yakima Valley Libraries Events';

const clean = (value) => String(value ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const idFor = (...parts) => createHash('sha256')
  .update(parts.map(clean).join('|').toLowerCase())
  .digest('hex')
  .slice(0, 20);

const FAMILY_TERMS = [
  'storytime',
  'toddler',
  'baby',
  'lapsit',
  'tinker',
  'craft',
  'steam',
  's.t.e.a.m',
  'game',
  'family',
  'kids',
  'children',
  'teen',
  'movie',
  'lotería',
  'reading',
];

function familyTags(title) {
  const lower = title.toLowerCase();
  return FAMILY_TERMS.some(term => lower.includes(term))
    ? ['free-family-event']
    : [];
}

export function parseYvlEvents(normalizedPageText, options = {}) {
  const observedAt = new Date(options.observed_at ?? Date.now()).toISOString();
  const sourceUrl = options.source_url ?? DEFAULT_SOURCE_URL;
  const sourceName = options.source_name ?? DEFAULT_SOURCE_NAME;
  const lines = String(normalizedPageText ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const events = [];

  for (let i = 0; i < lines.length; i += 1) {
    const titleMatch = lines[i].match(/^#####\s+(.+)$/);
    if (!titleMatch || /^######\s+/.test(lines[i])) continue;

    const title = clean(titleMatch[1]);
    let schedule = '';
    let location = '';

    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      const scheduleMatch = lines[j].match(/^######\s+(.+)$/);
      if (!schedule && scheduleMatch) {
        schedule = clean(scheduleMatch[1]);
        continue;
      }
      if (schedule && !/^#{1,6}\s+/.test(lines[j])) {
        location = clean(lines[j]);
        break;
      }
    }

    if (!title || !schedule) continue;

    events.push({
      id: 'yvl-' + idFor(title, schedule, location),
      title,
      description: location ? schedule + ' • ' + location : schedule,
      category: 'event',
      source_url: sourceUrl,
      source_name: sourceName,
      observed_at: observedAt,
      evidence_state: 'public',
      confidence: 0.95,
      eligibility: 'verified',
      gross_savings_cents: 0,
      gross_earnings_cents: 0,
      holiday_tags: familyTags(title),
      audience_tags: familyTags(title).length ? ['family'] : [],
      location: location ? { label: location } : null,
      actions: [
        {
          type: 'view_source',
          label: 'View event',
          url: sourceUrl,
        },
      ],
      sponsored: false,
      raw_metadata: {
        event_schedule_text: schedule,
        event_location_text: location || null,
        cost_state: 'library_program_source_describes_programs_as_free',
        parser: 'yvl-normalized-text-v1',
      },
    });
  }

  return events;
}


function browserEventOpportunity(title, schedule, browserResult, options = {}) {
  const observedAt = new Date(
    options.observed_at ??
    browserResult.finished_at ??
    Date.now()
  ).toISOString();
  const sourceUrl = options.source_url ?? browserResult.final_url ?? DEFAULT_SOURCE_URL;
  const sourceName = options.source_name ?? DEFAULT_SOURCE_NAME;

  return {
    id: 'yvl-' + idFor(title, schedule, sourceUrl),
    title: clean(title),
    description: clean(schedule),
    category: 'event',
    source_url: sourceUrl,
    source_name: sourceName,
    observed_at: observedAt,
    evidence_state: 'public',
    confidence: 0.98,
    eligibility: 'verified',
    gross_savings_cents: 0,
    gross_earnings_cents: 0,
    holiday_tags: familyTags(clean(title)),
    audience_tags: familyTags(clean(title)).length ? ['family'] : [],
    location: null,
    actions: [{
      type: 'view_source',
      label: 'View event',
      url: sourceUrl,
    }],
    sponsored: false,
    raw_metadata: {
      event_schedule_text: clean(schedule),
      event_location_text: null,
      cost_state: 'library_program_source_describes_programs_as_free',
      parser: 'yvl-browser-snapshot-v1',
      browser_engine: clean(browserResult.engine) || null,
      browser_text_sha256: clean(browserResult.text_sha256) || null,
      browser_evidence_receipt_sha256: clean(browserResult.evidence_receipt_sha256) || null,
    },
  };
}

export function parseYvlBrowserResult(browserResult, options = {}) {
  if (!browserResult || browserResult.ok !== true) {
    throw new Error('successful browser result is required');
  }
  if (!browserResult.snapshot || !Array.isArray(browserResult.snapshot.headings)) {
    throw new Error('browser snapshot headings are required');
  }
  if (!clean(browserResult.evidence_receipt_sha256)) {
    throw new Error('browser evidence receipt is required');
  }

  const headings = browserResult.snapshot.headings
    .map(row => ({
      level: clean(row?.level).toLowerCase(),
      text: clean(row?.text),
    }))
    .filter(row => row.level && row.text);

  const events = [];
  for (let i = 0; i < headings.length - 1; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    if (current.level !== 'h5' || next.level !== 'h6') continue;
    events.push(browserEventOpportunity(current.text, next.text, browserResult, options));
  }

  return events;
}
