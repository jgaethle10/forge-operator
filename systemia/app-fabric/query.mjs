function clean(value) {
  return String(value ?? '').trim();
}

export function safeKey(value, field = 'key') {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw new Error(`${field}_invalid`);
  }
  return key;
}

export function deepGet(source, path) {
  if (!path) return source;
  return String(path).split('.').reduce((value, segment) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[segment];
  }, source);
}

function scalarCompare(left, right) {
  if (left === right) return 0;
  const leftNumber = typeof left === 'number' ? left : Number.NaN;
  const rightNumber = typeof right === 'number' ? right : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber < rightNumber ? -1 : 1;
  }
  const l = String(left ?? '');
  const r = String(right ?? '');
  return l < r ? -1 : l > r ? 1 : 0;
}

function contains(actual, expected) {
  if (Array.isArray(actual)) {
    return Array.isArray(expected)
      ? expected.every((value) => actual.includes(value))
      : actual.includes(expected);
  }
  if (typeof actual === 'string') return actual.includes(String(expected ?? ''));
  if (actual && typeof actual === 'object') {
    return Object.prototype.hasOwnProperty.call(actual, String(expected));
  }
  return false;
}

function matchesOperator(actual, operator, expected) {
  switch (operator) {
    case '$eq': return actual === expected;
    case '$ne': return actual !== expected;
    case '$gt': return scalarCompare(actual, expected) > 0;
    case '$gte': return scalarCompare(actual, expected) >= 0;
    case '$lt': return scalarCompare(actual, expected) < 0;
    case '$lte': return scalarCompare(actual, expected) <= 0;
    case '$in': return Array.isArray(expected) && expected.includes(actual);
    case '$nin': return Array.isArray(expected) && !expected.includes(actual);
    case '$exists': return expected ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    case '$contains': return contains(actual, expected);
    case '$startsWith': return String(actual ?? '').startsWith(String(expected ?? ''));
    case '$endsWith': return String(actual ?? '').endsWith(String(expected ?? ''));
    case '$regex': {
      const pattern = String(expected ?? '');
      if (pattern.length > 256) throw new Error('query_regex_too_long');
      return new RegExp(pattern).test(String(actual ?? ''));
    }
    default: throw new Error(`query_operator_unsupported:${operator}`);
  }
}

function matchesValue(actual, expected) {
  if (
    expected &&
    typeof expected === 'object' &&
    !Array.isArray(expected) &&
    Object.keys(expected).some((key) => key.startsWith('$'))
  ) {
    return Object.entries(expected).every(([operator, value]) =>
      matchesOperator(actual, operator, value)
    );
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      ? expected.every((value) => actual.includes(value))
      : expected.includes(actual);
  }
  return actual === expected;
}

export function matchesQuery(record, query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('query_object_required');
  }
  if (Array.isArray(query.$and)) {
    if (!query.$and.every((entry) => matchesQuery(record, entry))) return false;
  }
  if (Array.isArray(query.$or)) {
    if (!query.$or.some((entry) => matchesQuery(record, entry))) return false;
  }
  if (query.$not && matchesQuery(record, query.$not)) return false;

  for (const [field, expected] of Object.entries(query)) {
    if (field.startsWith('$')) continue;
    if (!matchesValue(deepGet(record, field), expected)) return false;
  }
  return true;
}

export function normalizeFields(fields) {
  if (!fields) return [];
  const values = Array.isArray(fields) ? fields : String(fields).split(',');
  return [...new Set(values.map(clean).filter(Boolean))].slice(0, 200);
}

export function projectRecord(record, fields) {
  const normalized = normalizeFields(fields);
  if (!normalized.length) return structuredClone(record);
  const out = {};
  for (const field of normalized) {
    const value = deepGet(record, field);
    if (value !== undefined) out[field] = structuredClone(value);
  }
  if (record?.id != null && out.id == null) out.id = record.id;
  return out;
}

export function parseSort(sort) {
  if (!sort) return [];
  const values = Array.isArray(sort) ? sort : String(sort).split(',');
  return values.map((raw) => {
    const text = clean(raw);
    const descending = text.startsWith('-');
    const field = descending ? text.slice(1) : text;
    if (!field) throw new Error('sort_field_invalid');
    return { field, direction: descending ? -1 : 1 };
  });
}

function compareRows(a, b, clauses) {
  for (const clause of clauses) {
    const result = scalarCompare(deepGet(a, clause.field), deepGet(b, clause.field));
    if (result !== 0) return result * clause.direction;
  }
  return scalarCompare(a?.id, b?.id);
}

export function selectRows(rows, {
  query = {},
  sort = '',
  limit = 100,
  skip = 0,
  fields = []
} = {}) {
  const boundedLimit = Math.max(0, Math.min(5000, Number(limit ?? 100)));
  const boundedSkip = Math.max(0, Number(skip ?? 0));
  const clauses = parseSort(sort);
  let selected = rows.filter((row) => matchesQuery(row, query));
  if (clauses.length) selected = [...selected].sort((a, b) => compareRows(a, b, clauses));
  return selected
    .slice(boundedSkip, boundedSkip + boundedLimit)
    .map((row) => projectRecord(row, fields));
}
