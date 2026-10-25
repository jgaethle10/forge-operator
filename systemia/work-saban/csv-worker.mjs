import { parseSalesCsv, calculateRevenue, sha256, usd } from './csv-core.mjs';

const ALLOWED_ROLES = new Set(['analyst', 'writer', 'designer', 'auditor', 'coordinator']);

function requireStage(stages, role) {
  const result = stages?.[role];
  if (!result) throw new Error('missing_prerequisite_' + role);
  return result;
}

function reportMarkdown(analysis, writing) {
  const rows = analysis.monthly.map(row => '| ' + row.month + ' | ' + row.display + ' |').join('\n');
  const change = analysis.percent_change === null
    ? 'not defined (the previous month was zero)'
    : (analysis.percent_change > 0 ? '+' : '') + analysis.percent_change.toFixed(1) + '%';
  return [
    '# Monthly Sales Report',
    '',
    '## Verified figures',
    '',
    '| Month | Revenue (USD) |',
    '| --- | ---: |',
    rows,
    '',
    '**Latest month:** ' + analysis.current_month + ' (' + analysis.current_revenue + ')',
    '',
    '**Previous month:** ' + analysis.previous_month + ' (' + analysis.previous_revenue + ')',
    '',
    '**Change:** ' + analysis.change_display + ' (' + change + ')',
    '',
    '## Summary',
    '',
    writing.summary,
    '',
    '## Methodology and limitations',
    '',
    'Revenue amounts are summed from the supplied month/revenue CSV in exact cents. '
      + 'The change compares the two latest distinct months. '
      + 'No evidence about the cause of any change was provided.',
    '',
    '**Input fingerprint:** ' + analysis.source_sha256,
    '',
    '**Input rows:** ' + analysis.row_count,
    '',
  ].join('\n');
}

export async function runAssignment({ assignment, contract, executionContext = {} }) {
  const role = assignment?.role;
  if (contract?.software_id !== 'work-saban-csv-report-v1'
      || !ALLOWED_ROLES.has(role)
      || assignment?.work?.kind !== 'monthly_sales_csv'
      || !contract.roles.includes(role)) {
    throw new Error('unregistered_work_saban_assignment');
  }
  if (executionContext.local_file_read_approved !== true) {
    throw new Error('explicit_local_file_consent_required');
  }
  const csvText = executionContext.csvText;
  const stages = executionContext.stages || {};
  if (role === 'analyst') {
    const parsed = parseSalesCsv(csvText);
    return { role, source_sha256: parsed.source_sha256, ...calculateRevenue(parsed.rows) };
  }
  if (role === 'writer') {
    const a = requireStage(stages, 'analyst');
    const direction = BigInt(a.change_cents) > 0n ? 'increased' : BigInt(a.change_cents) < 0n ? 'decreased' : 'was unchanged';
    return {
      role, source_sha256: a.source_sha256,
      summary: 'Revenue ' + direction + ' from ' + a.previous_revenue + ' in ' + a.previous_month
        + ' to ' + a.current_revenue + ' in ' + a.current_month
        + '. The observed difference was ' + a.change_display
        + '. This report describes the recorded amounts, not the cause of the change.',
    };
  }
  if (role === 'designer') {
    const a = requireStage(stages, 'analyst');
    const w = requireStage(stages, 'writer');
    if (w.source_sha256 !== a.source_sha256) throw new Error('writer_source_mismatch');
    const markdown = reportMarkdown(a, w);
    return { role, source_sha256: a.source_sha256, markdown, content_sha256: sha256(markdown) };
  }
  if (role === 'auditor') {
    const a = requireStage(stages, 'analyst');
    const w = requireStage(stages, 'writer');
    const d = requireStage(stages, 'designer');
    const parsed = parseSalesCsv(csvText);
    if (a.source_sha256 !== parsed.source_sha256 || d.source_sha256 !== parsed.source_sha256
        || w.source_sha256 !== parsed.source_sha256) throw new Error('audit_source_mismatch');
    const independent = new Map();
    for (const row of parsed.rows) {
      independent.set(row.month, (independent.get(row.month) || 0n) + row.cents);
    }
    const actual = [...independent].sort(([a], [b]) => a.localeCompare(b));
    if (a.row_count !== parsed.rows.length || a.monthly.length !== actual.length) throw new Error('audit_row_count_mismatch');
    for (let i = 0; i < actual.length; i++) {
      if (a.monthly[i].month !== actual[i][0] || a.monthly[i].cents !== actual[i][1].toString()
          || a.monthly[i].display !== usd(actual[i][1])) throw new Error('audit_arithmetic_mismatch');
    }
    const prev = actual.at(-2), now = actual.at(-1);
    const delta = now[1] - prev[1];
    const independentPercent = prev[1] === 0n ? null : Math.round(Number(delta) / Math.abs(Number(prev[1])) * 1000) / 10;
    if (a.change_cents !== delta.toString()
        || a.previous_month !== prev[0] || a.current_month !== now[0]
        || a.previous_revenue !== usd(prev[1]) || a.current_revenue !== usd(now[1])
        || a.percent_change !== independentPercent) throw new Error('audit_delta_mismatch');
    if (d.content_sha256 !== sha256(d.markdown)
        || d.markdown !== reportMarkdown(a, w)) throw new Error('audit_report_integrity_mismatch');
    return {
      role, status: 'verified', source_sha256: parsed.source_sha256,
      report_sha256: d.content_sha256,
      controls: ['independent_reaggregation', 'row_count', 'month_delta', 'report_integrity', 'input_provenance'],
    };
  }
  if (role === 'coordinator') {
    const audit = requireStage(stages, 'auditor');
    const d = requireStage(stages, 'designer');
    if (audit.status !== 'verified' || audit.report_sha256 !== sha256(d.markdown)) {
      throw new Error('delivery_blocked_by_audit');
    }
    return {
      role, status: 'prepared_for_local_delivery',
      source_sha256: audit.source_sha256,
      report_sha256: audit.report_sha256,
      markdown: d.markdown,
      verified: true,
    };
  }
  throw new Error('invalid_work_saban_role');
}
