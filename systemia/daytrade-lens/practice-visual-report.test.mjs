import assert from "node:assert/strict";
import { renderPracticeReport } from "./practice-visual-report.mjs";

const fixture = {
  schema: "evercraft.daytrade-practice-camp.v1",
  mode: "SIMULATION_ONLY",
  live_order_capability_used: false,
  generated_at: "2026-10-14T20:00:00Z",
  historical_window: { start: "2026-08-01T00:00:00Z", end: "2026-10-13T23:59:59Z" },
  source_stats: [{ symbol: "TEST", bars: 100 }],
  test_fixture: true,
  adversarial_drills: [{ name: "stop-loss", passed: true }, { name: "stale-data", passed: false }],
  sessions: [
    {
      date: "2026-10-13",
      trade_count: 2,
      hard_violations: 0,
      trades: [
        { execution: "SIMULATION_ONLY", simulated_pnl: 0.03 },
        { execution: "SIMULATION_ONLY", simulated_pnl: -0.01 },
      ],
    },
    { date: "2026-10-14", trade_count: 0, hard_violations: 1, trades: [] },
  ],
};
const html = renderPracticeReport(fixture);
assert.ok(html.includes("TEST FIXTURE / SYNTHETIC EXAMPLE"));
assert.ok(html.includes("NOT CERTIFIED FOR LIVE CAPITAL"));
assert.ok(html.includes("Historical replay sessions"));
assert.ok(html.includes("Cumulative simulated profit and loss"));
assert.ok(html.includes("$0.0200"));
assert.ok(html.includes("No orders were sent to a broker"));
assert.ok(!html.includes("LIVE PROFIT"));
assert.ok(html.includes("<svg"));

const malicious = structuredClone(fixture);
malicious.sessions[0].date = "<img src=x onerror=alert(1)>";
malicious.source_stats[0].symbol = "<script>alert(1)</script>";
const safe = renderPracticeReport(malicious);
assert.ok(safe.includes("&lt;img src=x onerror=alert(1)&gt;"));
assert.ok(safe.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert.ok(!safe.includes("<script>"));

assert.throws(() => renderPracticeReport({ ...fixture, mode: "LIVE" }), /simulation_only/);
assert.throws(() => renderPracticeReport({ ...fixture, live_order_capability_used: true }), /simulation_only/);
assert.throws(() => renderPracticeReport({ ...fixture, sessions: [{}] }), /invalid_session_trades/);
assert.throws(() => renderPracticeReport({
  ...fixture,
  sessions: [{ trades: [{ execution: "BROKER_PAPER", simulated_pnl: 0.01 }] }],
}), /unverified_or_invalid/);
assert.throws(() => renderPracticeReport({
  ...fixture,
  sessions: [{ trades: [{ execution: "SIMULATION_ONLY", simulated_pnl: "garbage" }] }],
}), /unverified_or_invalid/);
const empty = renderPracticeReport({ ...fixture, sessions: [], adversarial_drills: [] });
assert.ok(empty.includes("No simulated trade results"));
assert.ok(!empty.includes("<svg"));
console.log(JSON.stringify({
  ok: true,
  checks: ["classification", "metrics", "static_svg", "no_live_claims", "html_escaping", "fail_closed", "empty_state"],
  fixture_only: true,
  live_orders: false
}));
