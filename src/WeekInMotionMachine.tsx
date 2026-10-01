import React, { useEffect, useState } from 'react';
import './week-in-motion.css';

type RunStatus = {
  id: string;
  status: string;
  window: { start: string; end: string; slug: string; timezone: string };
  evidence: { total: number; byTheme: Record<string, number>; byState: Record<string, number> };
  editorial: { status: string; thesis?: string | null; title?: string | null; excerpt?: string | null };
  gate: { pass: boolean; reasons: string[]; metrics: Record<string, number> };
  publication: { status: string; article_url?: string | null; public_release_status?: string | null };
};

type StatusResponse = {
  ok: boolean;
  software: string;
  mode: string;
  current: RunStatus | null;
  history_count: number;
  doctrine: Record<string, unknown>;
  resident_trigger: { cadence: string; week_boundary: string; timezone: string };
};

function badge(status?: string | null) {
  if (!status) return 'quiet';
  if (/published|pass|ready/i.test(status)) return 'good';
  if (/blocked|fail|error/i.test(status)) return 'bad';
  return 'warn';
}

function humanTheme(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function WeekInMotionMachine() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const current = status?.current;

  useEffect(() => {
    fetch('/api/week-in-motion/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('Week in Motion status is unavailable.');
        return response.json();
      })
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main className="wim-app">
      <header className="wim-shell wim-hero">
        <div>
          <div className="wim-eyebrow">EVERCRAFT · SYSTEMIA RESIDENT SOFTWARE</div>
          <h1>Week in Motion</h1>
          <p>
            The weekly institutional record of what Evercraft actually changed, what failed, what was proven,
            and what the company learned how to do next.
          </p>
        </div>
        <div className="wim-resident">
          <span className="pulse" />
          <div><strong>Resident</strong><small>Runs every completed Monday through Sunday cycle</small></div>
        </div>
      </header>

      {error && <section className="wim-shell wim-error">{error}</section>}

      <section className="wim-shell wim-grid">
        <article className="wim-card wim-primary">
          <div className="wim-card-head">
            <span>Current weekly cycle</span>
            <span className={`wim-badge ${badge(current?.status)}`}>{current?.status || 'waiting for first run'}</span>
          </div>
          {current ? (
            <>
              <h2>{current.window.start} to {current.window.end}</h2>
              <p className="wim-thesis">{current.editorial?.thesis || current.editorial?.excerpt || 'Evidence collected. Editorial thesis not yet admitted.'}</p>
              <div className="wim-metrics">
                <Metric label="Evidence receipts" value={String(current.evidence?.total ?? 0)} />
                <Metric label="Editorial" value={current.editorial?.status || 'pending'} />
                <Metric label="Quality gate" value={current.gate?.pass ? 'PASS' : 'HOLD'} />
                <Metric label="Journal" value={current.publication?.status || 'not attempted'} />
              </div>
              {current.publication?.article_url && (
                <a className="wim-link" href={current.publication.article_url} target="_blank" rel="noreferrer">
                  Open canonical Journal edition
                </a>
              )}
            </>
          ) : (
            <div className="wim-empty">
              No resident run has been persisted yet. The software is installed and waiting for its first completed weekly cycle.
            </div>
          )}
        </article>

        <article className="wim-card">
          <div className="wim-card-head"><span>Truth state</span><span>Evidence first</span></div>
          <div className="wim-state-list">
            {current && Object.keys(current.evidence?.byState || {}).length ? Object.entries(current.evidence.byState).map(([key, value]) => (
              <div key={key}><span>{humanTheme(key)}</span><strong>{value}</strong></div>
            )) : <p>No state ledger yet.</p>}
          </div>
        </article>
      </section>

      <section className="wim-shell">
        <div className="wim-section-title">
          <div><span>Evidence map</span><h2>What moved this week</h2></div>
          <small>Grouped from canonical receipts before editorial synthesis</small>
        </div>
        <div className="wim-theme-grid">
          {current && Object.keys(current.evidence?.byTheme || {}).length ? Object.entries(current.evidence.byTheme)
            .sort((a, b) => b[1] - a[1])
            .map(([key, value]) => (
              <article className="wim-theme" key={key}>
                <strong>{value}</strong>
                <span>{humanTheme(key)}</span>
              </article>
            )) : (
              ['Systemia','Yard + Infrastructure','Machine Discovery','RIVET + AliEV','ForensiScope','Network','Field Ops','Media + Publishing'].map((name) => (
                <article className="wim-theme ghost" key={name}><strong>0</strong><span>{name}</span></article>
              ))
            )}
        </div>
      </section>

      <section className="wim-shell wim-pipeline">
        <div className="wim-section-title"><div><span>Resident production line</span><h2>One week becomes one audited story</h2></div></div>
        <div className="wim-rail">
          {[
            ['01','Freeze week','Lock Monday through Sunday so current-week work cannot leak backward.'],
            ['02','Collect evidence','Pull receipts, repository motion, failures, field evidence, commerce and research state.'],
            ['03','Normalize truth','Separate observed, modeled, source-complete, runtime-proven, blocked and paid states.'],
            ['04','Find the thesis','Explain what changed about Evercraft as a company, not just what files changed.'],
            ['05','Editorial gauntlet','Enforce the Week 2 benchmark, evidence integrity and the no-one-liner publishing rule.'],
            ['06','Fallen handoff','Build the visual story from real screens, field media, diagrams and clearly labeled synthetic material.'],
            ['07','Journal release','Publish the deeper edition only after Systemia and live-render gates pass.'],
            ['08','Clip package','Prepare the substantive social master, platform derivatives and listen-along comment.'],
            ['09','Institutional memory','Archive the evidence ledger, failures, corrections, receipts and next-week obligations.'],
          ].map(([n,title,copy]) => <article key={n}><b>{n}</b><div><strong>{title}</strong><p>{copy}</p></div></article>)}
        </div>
      </section>

      <section className="wim-shell wim-grid">
        <article className="wim-card">
          <div className="wim-card-head"><span>Publishing doctrine</span><span className="wim-badge good">ENFORCED</span></div>
          <p>Long developed paragraphs are the default. Stacked short one-sentence cadence is a defect. No em dashes. Unsupported numbers fail the gate. A claim cannot cite evidence the machine did not collect.</p>
        </article>
        <article className="wim-card">
          <div className="wim-card-head"><span>Visual doctrine</span><span>Fallen</span></div>
          <p>Real product surfaces, real field imagery, verified diagrams and rights-cleared media lead. Synthetic visualization is allowed only when its evidence state remains explicit and it does not fabricate operational reality.</p>
        </article>
      </section>

      <footer className="wim-shell wim-footer">
        <span>Evercraft Week in Motion</span>
        <span>{status ? `${status.history_count} resident run${status.history_count === 1 ? '' : 's'} preserved` : 'Connecting to resident machine'}</span>
      </footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="wim-metric"><span>{label}</span><strong>{value}</strong></div>;
}
