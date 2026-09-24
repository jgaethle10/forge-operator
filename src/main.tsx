import React, { FormEvent, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

type ForgeAction = {
  rank: number;
  title: string;
  category: string;
  timeline: string;
  impact: string;
  rationale: string;
  implementationSteps: string[];
};

type ForgeReport = {
  businessSummary: string;
  operationalMetrics: {
    automationFeasibility: string;
    riskLevel: string;
    estimatedTimeSaved: string;
    speedToFirstValue: string;
  };
  topThreeActions: ForgeAction[];
  singleNextAction: {
    title: string;
    timeToExecute: string;
    immediateFirstStep: string;
    starterTemplateOrPrompt: string;
    successVerification: string;
  };
};

function App() {
  const [businessProblem, setBusinessProblem] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [businessContext, setBusinessContext] = useState('');
  const [report, setReport] = useState<ForgeReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setReport(null);
    setLoading(true);

    try {
      const response = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessProblem, desiredOutcome, businessContext }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Forge could not generate a plan.');
      }

      setReport(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero shell">
        <div className="eyebrow">EVERCRAFT · FORGE OPERATOR</div>
        <h1>Turn an operational bottleneck into a concrete execution plan.</h1>
        <p className="lede">
          Describe the pain. Forge identifies the highest-leverage actions, what AI can handle,
          where a human must stay in the loop, and the next move you can execute immediately.
        </p>

        <div className="trust-row" aria-label="Forge operating principles">
          <span>Practical output</span>
          <span>Human gates</span>
          <span>Fast first value</span>
          <span>No software migration required to start</span>
        </div>
      </section>

      <section className="shell workspace">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="section-label">Start with the pain</div>

          <label>
            What is breaking, slow, expensive, repetitive, or stuck?
            <textarea
              required
              value={businessProblem}
              onChange={(e) => setBusinessProblem(e.target.value)}
              placeholder="Example: Every quote is re-keyed into three systems and follow-up slips when the office gets busy."
              rows={5}
            />
          </label>

          <label>
            What outcome do you want?
            <textarea
              required
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              placeholder="Example: Cut quote turnaround to same-day and stop leads from disappearing."
              rows={4}
            />
          </label>

          <label>
            Context <span className="muted">(optional)</span>
            <textarea
              value={businessContext}
              onChange={(e) => setBusinessContext(e.target.value)}
              placeholder="Industry, team size, tools, constraints, existing workflow..."
              rows={4}
            />
          </label>

          <button className="primary" disabled={loading}>
            {loading ? 'Forging the plan…' : 'Build my operating plan'}
          </button>

          <p className="fineprint">
            Forge produces decision support and implementation guidance. High-stakes financial,
            legal, safety, employment, and external communication decisions remain human-gated.
          </p>

          {error && <div className="error">{error}</div>}
        </form>

        <aside className="panel outcome-panel">
          <div className="section-label">What comes back</div>
          <div className="outcome-grid">
            <article><strong>01</strong><span>Top three interventions</span></article>
            <article><strong>02</strong><span>Automation surface</span></article>
            <article><strong>03</strong><span>Human-required gates</span></article>
            <article><strong>04</strong><span>Largest operational risk</span></article>
            <article><strong>05</strong><span>Single next action</span></article>
            <article><strong>06</strong><span>Implementation blueprint</span></article>
          </div>
          <div className="signal">
            <div className="signal-dot" />
            <div>
              <strong>Machine-discoverable service</strong>
              <p>Public capability metadata is published for AI assistants and agents.</p>
            </div>
          </div>
        </aside>
      </section>

      {report && (
        <section className="shell results" aria-live="polite">
          <div className="result-head">
            <div>
              <div className="section-label">Forge report</div>
              <h2>{report.businessSummary}</h2>
            </div>
          </div>

          <div className="metrics">
            <Metric label="Automation" value={report.operationalMetrics.automationFeasibility} />
            <Metric label="Risk" value={report.operationalMetrics.riskLevel} />
            <Metric label="Time saved" value={report.operationalMetrics.estimatedTimeSaved} />
            <Metric label="First value" value={report.operationalMetrics.speedToFirstValue} />
          </div>

          <div className="actions">
            {report.topThreeActions?.map((action) => (
              <article className="action-card" key={action.rank}>
                <div className="rank">0{action.rank}</div>
                <div>
                  <div className="action-meta">{action.category} · {action.timeline}</div>
                  <h3>{action.title}</h3>
                  <p>{action.rationale}</p>
                  <strong className="impact">{action.impact}</strong>
                  <ol>
                    {action.implementationSteps?.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>
              </article>
            ))}
          </div>

          <article className="next-action">
            <div className="section-label">Do this next</div>
            <h3>{report.singleNextAction?.title}</h3>
            <p>{report.singleNextAction?.immediateFirstStep}</p>
            <pre>{report.singleNextAction?.starterTemplateOrPrompt}</pre>
            <div className="verify">
              <strong>{report.singleNextAction?.timeToExecute}</strong>
              <span>{report.singleNextAction?.successVerification}</span>
            </div>
          </article>
        </section>
      )}

      <footer className="shell footer">
        <span>Forge Operator by Evercraft</span>
        <span>Problem → proof → execution</span>
      </footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
