import React, { useEffect, useMemo, useState } from 'react';
import './week-in-motion.css';

type EvidenceSummary = {
  total: number;
  byTheme: Record<string, number>;
  byState: Record<string, number>;
  collectors?: Record<string, number>;
};

type RunStatus = {
  id: string;
  status: string;
  window: { start: string; end: string; slug: string; timezone: string };
  evidence: EvidenceSummary;
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
  inbox?: {
    total: number;
    latest_received_at: string | null;
  };
  doctrine: Record<string, unknown>;
  resident_trigger: { cadence: string; week_boundary: string; timezone: string };
};

const PIPELINE = [
  ['01', 'Collect', 'Evidence arrives all week from Systemia and owned systems.'],
  ['02', 'Reconcile', 'Duplicates, contradictions and truth states are resolved before prose.'],
  ['03', 'Synthesize', 'The machine finds the company-level story behind the motion.'],
  ['04', 'Challenge', 'Editorial, evidence and adversarial gates attack the draft.'],
  ['05', 'Visualize', 'Fallen receives a source-grounded visual brief.'],
  ['06', 'Release', 'Journal and Clip receive only approved output and receipts.'],
];

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusTone(value?: string | null) {
  if (!value) return 'neutral';
  if (/published|pass|ready|verified|success/i.test(value)) return 'good';
  if (/blocked|fail|error|hold/i.test(value)) return 'bad';
  return 'warm';
}

function prettyDate(value?: string | null) {
  if (!value) return 'Not yet';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

function currentWeekLabel() {
  const now = new Date();
  const monday = new Date(now);
  const days = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - days);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return fmt.format(monday) + ' to ' + fmt.format(sunday);
}

export default function WeekInMotionMachine() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [operatorState, setOperatorState] = useState('');
  const [running, setRunning] = useState(false);
  const [archive, setArchive] = useState<RunStatus[]>([]);
  const current = status?.current;

  async function refresh() {
    const response = await fetch('/api/week-in-motion/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Week in Motion status is unavailable.');
    setStatus(await response.json());
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function loadArchive() {
    if (!adminToken.trim()) {
      setOperatorState('Operator token required.');
      return;
    }
    try {
      const response = await fetch('/api/week-in-motion/history', {
        headers: { Authorization: 'Bearer ' + adminToken.trim() },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Archive unavailable.');
      setArchive(Array.isArray(payload?.runs) ? payload.runs : []);
      setOperatorState('Archive loaded.');
    } catch (err) {
      setOperatorState(err instanceof Error ? err.message : String(err));
    }
  }

  async function runMachine(publish: boolean) {
    if (!adminToken.trim()) {
      setOperatorState('Operator token required.');
      return;
    }
    setRunning(true);
    setOperatorState(publish
      ? 'Running the complete weekly editorial cycle. Publication remains gate-bound.'
      : 'Running an audit-only weekly cycle.');
    try {
      const response = await fetch('/api/week-in-motion/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + adminToken.trim(),
        },
        body: JSON.stringify({ publish }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || payload?.result?.gate?.reasons?.join(', ') || 'Run blocked.');
      setOperatorState(payload?.result?.status === 'published'
        ? 'Published, verified and receipted.'
        : 'Audit complete. Release remains held.');
      await refresh();
    } catch (err) {
      setOperatorState(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const themes = useMemo(() => {
    const entries = Object.entries(current?.evidence?.byTheme || {}).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(([, value]) => value));
    return entries.map(([name, value]) => ({ name, value, width: Math.max(5, Math.round((value / max) * 100)) }));
  }, [current]);

  const truthStates = useMemo(
    () => Object.entries(current?.evidence?.byState || {}).sort((a, b) => b[1] - a[1]),
    [current],
  );

  const gateReasons = current?.gate?.reasons || [];
  const articleTitle = current?.editorial?.title || 'The weekly record is still being assembled.';
  const thesis = current?.editorial?.thesis || current?.editorial?.excerpt || 'Evidence is being collected before the machine decides what the week actually meant.';
  const phase = current?.status === 'published'
    ? 'Published'
    : current?.status === 'ready'
      ? 'Ready for release'
      : current?.status?.startsWith('blocked')
        ? 'Held by evidence'
        : 'Collecting';

  return (
    <main className="motion">
      <header className="motion-masthead">
        <div className="motion-brand">
          <span className="motion-monogram">E</span>
          <div><strong>EVERCRAFT</strong><small>WEEK IN MOTION</small></div>
        </div>
        <div className="motion-mast-meta">
          <span>{currentWeekLabel()}</span>
          <span className="motion-live"><i /> Resident software</span>
        </div>
      </header>

      <section className="motion-hero">
        <div className="motion-hero-copy">
          <div className="motion-kicker">THE COMPANY, RECORDED WHILE IT MOVES</div>
          <h1>{articleTitle}</h1>
          <p>{thesis}</p>
          <div className="motion-hero-actions">
            {current?.publication?.article_url && (
              <a href={current.publication.article_url} target="_blank" rel="noreferrer">Read the Journal edition</a>
            )}
            <button type="button" onClick={() => document.getElementById('operator')?.scrollIntoView({ behavior: 'smooth' })}>
              Open operator console
            </button>
          </div>
        </div>

        <aside className="motion-edition">
          <div className="motion-edition-top">
            <span>Current edition</span>
            <span className={'motion-state ' + statusTone(current?.status)}>{phase}</span>
          </div>
          <div className="motion-edition-number">{current?.evidence?.total ?? 0}</div>
          <div className="motion-edition-label">receipts in the completed-week ledger</div>
          <dl>
            <div><dt>Evidence inbox</dt><dd>{status?.inbox?.total ?? 0}</dd></div>
            <div><dt>Archive</dt><dd>{status?.history_count ?? 0} editions</dd></div>
            <div><dt>Last receipt</dt><dd>{prettyDate(status?.inbox?.latest_received_at)}</dd></div>
            <div><dt>Journal</dt><dd>{current?.publication?.status || 'held'}</dd></div>
          </dl>
        </aside>
      </section>

      {error && <div className="motion-alert">{error}</div>}

      <section className="motion-newsline">
        <span>Systemia admitted</span>
        <b>Evidence before narrative</b>
        <span>Fallen visual handoff</span>
        <b>No unsupported numbers</b>
        <span>Journal release gate</span>
        <b>No stacked one-line cadence</b>
      </section>

      <section className="motion-spread">
        <article className="motion-story">
          <div className="motion-section-head">
            <div><span>Editorial desk</span><h2>What the machine thinks mattered.</h2></div>
            <span className={'motion-state ' + statusTone(current?.editorial?.status)}>{current?.editorial?.status || 'waiting'}</span>
          </div>
          <div className="motion-story-body">
            <p className="motion-dropcap">{thesis}</p>
            <div className="motion-story-note">
              <strong>Editorial contract</strong>
              <p>The story is generated only from the frozen evidence packet for the completed week. Current-week work cannot leak backward into the edition.</p>
            </div>
          </div>
        </article>

        <aside className="motion-proof">
          <div className="motion-section-head"><div><span>Proof room</span><h2>Truth state.</h2></div></div>
          <div className="motion-truth-list">
            {truthStates.length ? truthStates.map(([name, value]) => (
              <div key={name}><span>{label(name)}</span><strong>{value}</strong></div>
            )) : (
              <>
                <div><span>Observed repository event</span><strong>0</strong></div>
                <div><span>Runtime verified</span><strong>0</strong></div>
                <div><span>Blocked or partial</span><strong>0</strong></div>
              </>
            )}
          </div>
          <p className="motion-proof-note">Designed is not built. Built is not deployed. Modeled is not observed. Checkout is not payment.</p>
        </aside>
      </section>

      <section className="motion-evidence">
        <div className="motion-section-head wide">
          <div><span>Evidence desk</span><h2>Where the company moved.</h2></div>
          <p>Volume is not importance. This view shows the shape of the evidence packet before editorial weighting.</p>
        </div>
        <div className="motion-theme-list">
          {themes.length ? themes.map((theme, index) => (
            <div className="motion-theme-row" key={theme.name}>
              <span className="motion-theme-rank">{String(index + 1).padStart(2, '0')}</span>
              <strong>{label(theme.name)}</strong>
              <div className="motion-theme-track"><i style={{ width: theme.width + '%' }} /></div>
              <span>{theme.value}</span>
            </div>
          )) : (
            ['Systemia', 'Infrastructure', 'Products', 'Research', 'Field operations', 'Media and publishing'].map((name, index) => (
              <div className="motion-theme-row ghost" key={name}>
                <span className="motion-theme-rank">{String(index + 1).padStart(2, '0')}</span>
                <strong>{name}</strong>
                <div className="motion-theme-track"><i /></div>
                <span>0</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="motion-release">
        <div className="motion-section-head wide">
          <div><span>Production rail</span><h2>One week. Six rooms. One release.</h2></div>
          <p>The software stays resident all week. Monday synthesis is only the final assembly step.</p>
        </div>
        <div className="motion-pipeline">
          {PIPELINE.map(([number, title, copy], index) => {
            const active = current?.status === 'published' ? true : index < 3;
            return (
              <article className={active ? 'active' : ''} key={number}>
                <span>{number}</span>
                <div><strong>{title}</strong><p>{copy}</p></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="motion-studio-grid">
        <article className="motion-studio-card fallen">
          <div className="motion-card-label">FALLEN · VISUAL DESK</div>
          <h2>Turn proof into something worth watching.</h2>
          <p>Real product surfaces, field imagery, verified diagrams and rights-cleared media lead. Synthetic visualization is allowed only when its state remains explicit.</p>
          <div className="motion-card-footer"><span>Visual brief</span><strong>{current?.editorial?.status === 'generated' ? 'Prepared' : 'Awaiting editorial'}</strong></div>
        </article>
        <article className="motion-studio-card journal">
          <div className="motion-card-label">EVERCRAFT JOURNAL · DEEP EDITION</div>
          <h2>The canonical long-form record.</h2>
          <p>The Journal receives the deeper edition only after the evidence, editorial and release gates pass. Listen-along remains attached to the canonical article.</p>
          <div className="motion-card-footer"><span>Release state</span><strong>{current?.publication?.status || 'Held'}</strong></div>
        </article>
        <article className="motion-studio-card clip">
          <div className="motion-card-label">EVERCRAFT CLIP · DISTRIBUTION</div>
          <h2>One story becomes the week’s media package.</h2>
          <p>The substantive social master, platform derivatives and listen-along comment are produced from the same approved editorial package instead of being rewritten from memory.</p>
          <div className="motion-card-footer"><span>Distribution</span><strong>Gate-bound</strong></div>
        </article>
      </section>

      <section className="motion-quality">
        <div className="motion-section-head wide">
          <div><span>Standards room</span><h2>The draft has to earn daylight.</h2></div>
          <span className={'motion-state ' + (current?.gate?.pass ? 'good' : 'warm')}>{current?.gate?.pass ? 'Preflight passed' : 'Preflight held'}</span>
        </div>
        <div className="motion-quality-grid">
          <div><b>{current?.gate?.metrics?.proseParagraphs ?? 'Not ready'}</b><span>developed paragraphs</span></div>
          <div><b>{current?.gate?.metrics?.claimReceiptCount ?? 'Not ready'}</b><span>claim receipts</span></div>
          <div><b>{current?.gate?.metrics?.averageWordsPerProseParagraph ? Math.round(current.gate.metrics.averageWordsPerProseParagraph) : 'Not ready'}</b><span>avg. words per paragraph</span></div>
          <div><b>{gateReasons.length}</b><span>active gate objections</span></div>
        </div>
        {gateReasons.length > 0 && (
          <div className="motion-objections">
            {gateReasons.slice(0, 6).map((reason) => <span key={reason}>{label(reason)}</span>)}
          </div>
        )}
      </section>

      <section className="motion-operator" id="operator">
        <div className="motion-operator-copy">
          <span>Operator console</span>
          <h2>Intervene without becoming the workflow.</h2>
          <p>The resident engine should finish the week without you. These controls exist for inspection, recovery and deliberate reruns when evidence changes.</p>
        </div>
        <div className="motion-console">
          <label>Operator token<input type="password" autoComplete="off" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="Private operator credential" /></label>
          <div className="motion-console-actions">
            <button disabled={running} onClick={() => runMachine(false)}>Run audit only</button>
            <button disabled={running} onClick={loadArchive}>Open archive</button>
            <button className="primary" disabled={running} onClick={() => runMachine(true)}>Run + release if clean</button>
          </div>
          {operatorState && <p>{operatorState}</p>}
        </div>
      </section>

      {archive.length > 0 && (
        <section className="motion-archive">
          <div className="motion-section-head wide">
            <div><span>Archive room</span><h2>The company, week by week.</h2></div>
            <p>Each edition is a frozen evidence window. Later work can add context, but it cannot rewrite what that week had actually proven.</p>
          </div>
          <div className="motion-archive-grid">
            {archive.map((run, index) => (
              <article key={run.id || index}>
                <div className="motion-archive-number">{String(archive.length - index).padStart(2, '0')}</div>
                <div className="motion-archive-date">{run.window?.start} to {run.window?.end}</div>
                <h3>{run.editorial?.title || 'Week in Motion'}</h3>
                <p>{run.editorial?.thesis || run.editorial?.excerpt || 'Evidence preserved. Editorial thesis unavailable.'}</p>
                <div className="motion-archive-meta">
                  <span>{run.evidence?.total || 0} receipts</span>
                  <span className={'motion-state ' + statusTone(run.status)}>{run.status}</span>
                </div>
                {run.publication?.article_url && <a href={run.publication.article_url} target="_blank" rel="noreferrer">Open edition</a>}
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="motion-footer">
        <div><strong>EVERCRAFT WEEK IN MOTION</strong><span>Institutional memory with an editorial spine.</span></div>
        <div><span>Systemia authority</span><span>Fallen visuals</span><span>Journal record</span><span>Clip distribution</span></div>
      </footer>
    </main>
  );
}
