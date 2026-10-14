import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Presentation only. Never submits orders or turns historical replays into broker-paper evidence.
const SCHEMA = "evercraft.daytrade-practice-camp.v1";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const fixed = (value, digits = 2) => number(value).toFixed(digits);
const money = (value) => (number(value) < 0 ? "-" : "") + "$" + fixed(Math.abs(number(value)), 4);
const safeLabel = (value) => escapeHtml(value ?? "unknown");

function equityChart(values) {
  if (!values.length) {
    return "<div class='no-data'>No simulated trade results in this report. No equity curve generated.</div>";
  }
  let balance = 0;
  const equity = [0, ...values.map((value) => (balance += value))];
  const low = Math.min(...equity);
  const high = Math.max(...equity);
  const spread = Math.max(high - low, 0.0001);
  const coords = equity.map((value, i) => {
    const x = 20 + (i / Math.max(1, equity.length - 1)) * 920;
    const y = 190 - ((value - low) / spread) * 145;
    return fixed(x, 1) + "," + fixed(y, 1);
  }).join(" ");
  return "<svg role='img' aria-label='Cumulative simulated profit and loss from historical replay, not broker fills' viewBox='0 0 960 230' preserveAspectRatio='none'>" +
    "<line x1='20' y1='190' x2='940' y2='190' stroke='#2c4762'/>" +
    "<polyline points='" + coords + "' fill='none' stroke='#5cebd2' stroke-width='4' stroke-linejoin='round' stroke-linecap='round'/>" +
    "</svg>";
}

export function renderPracticeReport(report) {
  if (!report || report.schema !== SCHEMA || report.mode !== "SIMULATION_ONLY" || report.live_order_capability_used !== false) {
    throw new Error("report_must_be_simulation_only_with_live_orders_disabled");
  }
  if (!Array.isArray(report.sessions) || !Array.isArray(report.adversarial_drills)) {
    throw new Error("missing_sessions_or_drills");
  }
  const sessions = report.sessions;
  const trades = sessions.flatMap((s) => {
    if (!Array.isArray(s.trades)) throw new Error("invalid_session_trades");
    return s.trades;
  });
  for (const trade of trades) {
    if (trade.execution !== "SIMULATION_ONLY" || !Number.isFinite(Number(trade.simulated_pnl))) {
      throw new Error("cannot_render_unverified_or_invalid_trades");
    }
  }
  const pnl = trades.map((trade) => number(trade.simulated_pnl));
  const net = pnl.reduce((a, b) => a + b, 0);
  const hardViolations = sessions.reduce((a, s) => a + number(s.hard_violations), 0);
  const drillsPassed = report.adversarial_drills.filter((d) => d.passed === true).length;
  const generated = safeLabel(report.generated_at);
  const fixture = report.test_fixture === true;
  const rows = sessions.slice(-12).reverse().map((s) =>
    "<tr><td>" + safeLabel(s.date) + "</td><td>" + number(s.trade_count) +
    "</td><td>" + money((s.trades || []).reduce((sum, t) => sum + number(t.simulated_pnl), 0)) +
    "</td><td>" + number(s.hard_violations) + "</td></tr>"
  ).join("");
  const sourceRows = (Array.isArray(report.source_stats) ? report.source_stats : [])
    .map((s) => safeLabel(s.symbol) + " (" + number(s.bars) + " bars)").join(", ");
  const label = fixture ? "TEST FIXTURE / SYNTHETIC EXAMPLE" : "HISTORICAL REPLAY / SIMULATION ONLY";
  const style = [
    "*{box-sizing:border-box}body{margin:0;background:#07111e;color:#e8f3ff;font:15px system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5}",
    ".wrap{max-width:1140px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}",
    ".brand{font-size:13px;letter-spacing:.2em;font-weight:800;color:#76b9fe}.flag{background:#16384e;border:1px solid #4ca4bf;color:#aff8ed;padding:9px 13px;border-radius:8px;font-size:12px;font-weight:800}",
    "h1{font-size:clamp(33px,6vw,62px);letter-spacing:-.04em;line-height:1.05;margin:35px 0 10px}h2{font-size:21px;margin:5px 0 16px}.muted{color:#a5b9cc}",
    ".intro{max-width:760px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:26px 0}",
    ".card,.panel{background:#0e2033;border:1px solid #26445d;border-radius:14px;padding:22px}.metric{font-size:clamp(25px,3vw,40px);font-weight:800;letter-spacing:-.035em}.metriclabel{font-size:12px;color:#a5b9cc;text-transform:uppercase;letter-spacing:.08em}",
    ".panels{display:grid;grid-template-columns:1.65fr 1fr;gap:14px}.wide{min-height:325px}svg{width:100%;height:230px;display:block}",
    ".note{background:#111e2c;border-left:4px solid #50dfc6;padding:15px 18px;margin:26px 0;color:#cfdef0}",
    "table{width:100%;border-collapse:collapse}td,th{padding:12px 10px;border-bottom:1px solid #29435b;text-align:left;font-size:13px}th{color:#afc6d9;font-weight:600}",
    ".foot{margin-top:24px;border-top:1px solid #284258;padding:20px 0;color:#abc0d0;font-size:12px}.no-data{padding:60px 18px;color:#a5b9cc;text-align:center}",
    ".pill{display:inline-block;border:1px solid #3c6b82;border-radius:99px;padding:4px 11px;color:#83f2d9;font-size:12px}.status{color:#83f2d9;font-weight:700}",
    "@media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.panels{grid-template-columns:1fr}.wrap{padding:18px}.card,.panel{padding:16px}}",
  ].join("");
  return [
    "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<meta name='robots' content='noindex,nofollow'><title>Evercraft | DayTrade Practice Receipts</title><style>", style, "</style></head><body>",
    "<main class='wrap'><div class='top'><div class='brand'>EVERCRAFT / DAYTRADE LENS</div><div class='flag'>", label, "</div></div>",
    "<h1>Practice is the product.<br>Proof is the standard.</h1>",
    "<p class='intro muted'>Visual practice receipt generated from existing historical replay output. This is not live trading, broker-observed paper fills, forward performance, or evidence of a profitable strategy.</p>",
    "<div class='grid'>",
    "<div class='card'><div class='metric'>", String(sessions.length), "</div><div class='metriclabel'>Historical replay sessions</div></div>",
    "<div class='card'><div class='metric'>", String(trades.length), "</div><div class='metriclabel'>Simulated trades</div></div>",
    "<div class='card'><div class='metric'>", String(drillsPassed), "/", String(report.adversarial_drills.length), "</div><div class='metriclabel'>Risk drills passed</div></div>",
    "<div class='card'><div class='metric'>", String(hardViolations), "</div><div class='metriclabel'>Recorded hard rule violations</div></div></div>",
    "<div class='panels'><section class='panel wide'><h2>Simulated outcome trajectory</h2><div class='muted'>Cumulative replay P&amp;L, not brokerage-account returns</div>",
    equityChart(pnl), "<span class='pill'>Net simulated P&amp;L: ", money(net), "</span></section>",
    "<section class='panel'><h2>Independent certification</h2><p class='status'>NOT CERTIFIED FOR LIVE CAPITAL</p>",
    "<p class='muted'>Historical simulation results never qualify as broker-observed paper fills. Real-money authorization must remain separate, manual, and subject to independent review.</p>",
    "<p><strong>Generated at:</strong> ", generated, "</p><p><strong>Replay window:</strong> ",
    safeLabel(report.historical_window?.start), " to ", safeLabel(report.historical_window?.end), "</p>",
    "<p class='muted'>Data reported by run: ", sourceRows || "not declared", "</p></section></div>",
    "<div class='note'><strong>Practice classification:</strong> ", fixture ? "Synthetic test fixture." : "Historical simulation.", " No orders were sent to a broker by this report generator. Simulated fills, any slippage modeling, and the replay input are not independently authenticated broker execution receipts.</div>",
    "<section class='panel'><h2>Recent practice sessions</h2><table><thead><tr><th>Replay date</th><th>Simulated trades</th><th>Simulated P&amp;L</th><th>Rule violations</th></tr></thead><tbody>",
    rows || "<tr><td colspan='4'>No recorded sessions in input.</td></tr>",
    "</tbody></table></section><div class='foot'>DAYTRADE LENS | EVIDENCE-BOUND VISUAL REPORT | Generated locally from a specific JSON receipt. Do not represent as real money, advice, or broker-verified results.</div></main></body></html>"
  ].join("");
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) throw new Error("usage: node practice-visual-report.mjs <practice.json> <report.html>");
  const report = JSON.parse(fs.readFileSync(input, "utf8"));
  const html = renderPracticeReport(report);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html, "utf8");
  console.log(JSON.stringify({ ok: true, output, classification: report.test_fixture ? "TEST_FIXTURE" : "SIMULATION_ONLY", live_orders: false }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) {
    console.error("Practice visual report failed:", error.message);
    process.exitCode = 1;
  }
}
