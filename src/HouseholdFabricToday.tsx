import React, { useEffect, useMemo, useState } from 'react';
import './household-fabric.css';

type Opportunity = {
  id: string;
  title: string;
  category: string;
  value_basis: string;
  net_value_cents: number;
  confidence: number;
  evidence_label: string;
  requires_eligibility_check: boolean;
  observed_at: string | null;
  expires_at: string | null;
  source_name: string | null;
  source_url: string | null;
  location: { label?: string; address?: string } | null;
  actions: Array<{ type: string; label: string; url: string | null }>;
  sponsored: boolean;
  sponsor_label: string | null;
};

type TodayPayload = {
  ok: true;
  generated_at: string;
  geography: string;
  mode: string;
  status: string;
  coverage: {
    healthy: boolean;
    degraded_categories: string[];
    conflicts_open: number;
  };
  headline: {
    money_kept_cents: number;
    money_earned_cents: number;
    opportunities_shown: number;
  };
  opportunities: Opportunity[];
  message: string;
};

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format((Number(cents) || 0) / 100);
}

function relativeFreshness(value: string | null) {
  if (!value) return 'Freshness unknown';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Recently checked';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'Checked moments ago';
  if (minutes < 60) return 'Checked ' + minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return 'Checked ' + hours + ' hr ago';
  const days = Math.floor(hours / 24);
  return 'Checked ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
}

function categoryLabel(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function HouseholdFabricToday() {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let live = true;
    fetch('/api/household-fabric/yakima/today', { headers: { accept: 'application/json' } })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error('unavailable');
        return payload as TodayPayload;
      })
      .then(payload => {
        if (!live) return;
        setData(payload);
        setState('ready');
      })
      .catch(() => {
        if (!live) return;
        setState('unavailable');
      });
    return () => { live = false; };
  }, []);

  const headline = useMemo(() => {
    if (!data) return null;
    const kept = data.headline.money_kept_cents;
    const earned = data.headline.money_earned_cents;
    if (kept > 0 && earned > 0) return money(kept) + ' to keep · ' + money(earned) + ' to earn';
    if (kept > 0) return money(kept) + ' worth keeping today';
    if (earned > 0) return money(earned) + ' worth earning today';
    return data.headline.opportunities_shown + ' useful local signal' +
      (data.headline.opportunities_shown === 1 ? '' : 's') + ' today';
  }, [data]);

  return (
    <main className="hf-page">
      <section className="hf-hero hf-shell">
        <a className="hf-brand" href="/">EVERCRAFT · HOUSEHOLD FABRIC</a>
        <div className="hf-kicker">YAKIMA · TODAY</div>
        <h1>What can make today a little easier?</h1>
        <p>
          Fresh local savings, useful free things, work opportunities and everyday resources,
          ranked by what is actually worth your time.
        </p>
      </section>

      <section className="hf-shell">
        {state === 'loading' && (
          <div className="hf-state">
            <span className="hf-pulse" />
            Checking Yakima now…
          </div>
        )}

        {state === 'unavailable' && (
          <div className="hf-unavailable">
            <strong>We don't have enough trustworthy local data to show this yet.</strong>
            <p>We'd rather show nothing than give you an old price or a made-up deal. Coverage is being built source by source.</p>
          </div>
        )}

        {state === 'ready' && data && (
          <>
            <div className="hf-summary">
              <div>
                <div className="hf-label">Today's signal</div>
                <h2>{headline}</h2>
                <p>{data.message}</p>
              </div>
              <div className={'hf-health ' + (data.coverage.healthy ? 'is-good' : 'is-building')}>
                <span />
                {data.coverage.healthy ? 'Local coverage healthy' : 'Coverage still growing'}
              </div>
            </div>

            {data.coverage.degraded_categories.length > 0 && (
              <div className="hf-coverage">
                <strong>Still building:</strong>
                <div>
                  {data.coverage.degraded_categories.map(category => (
                    <span key={category}>{categoryLabel(category)}</span>
                  ))}
                </div>
                <p>Thin categories stay visible as gaps. They are never silently filled with guesses.</p>
              </div>
            )}

            <div className="hf-feed" aria-live="polite">
              {data.opportunities.length === 0 ? (
                <div className="hf-empty">
                  Nothing strong enough to recommend right now. That's a valid answer too.
                </div>
              ) : data.opportunities.map((item, index) => (
                <article className="hf-card" key={item.id}>
                  <div className="hf-rank">{String(index + 1).padStart(2, '0')}</div>
                  <div className="hf-card-body">
                    <div className="hf-card-meta">
                      <span>{categoryLabel(item.category)}</span>
                      <span>{relativeFreshness(item.observed_at)}</span>
                      {item.sponsored && <span className="hf-sponsored">{item.sponsor_label || 'Sponsored'}</span>}
                    </div>
                    <h3>{item.title}</h3>
                    <div className="hf-value-row">
                      {item.net_value_cents > 0 && (
                        <strong>
                          {item.value_basis === 'earn' ? 'Potential value ' : 'Potential savings '}
                          {money(item.net_value_cents)}
                        </strong>
                      )}
                      {item.location?.label && <span>{item.location.label}</span>}
                    </div>
                    <div className="hf-proof">
                      {item.source_name && <span>Source: {item.source_name}</span>}
                      <span>Evidence: {categoryLabel(item.evidence_label)}</span>
                      {item.requires_eligibility_check && <span>Eligibility needs checking</span>}
                    </div>
                    <div className="hf-actions">
                      {item.actions.map((action, i) => action.url && (
                        <a key={action.type + i} href={action.url} target="_blank" rel="noreferrer">
                          {action.label || 'View source'}
                        </a>
                      ))}
                      {!item.actions.some(action => action.url) && item.source_url && (
                        <a href={item.source_url} target="_blank" rel="noreferrer">View source</a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="hf-footer hf-shell">
        <span>No poverty score. No pay-to-rank deals.</span>
        <span>Missing data stays missing.</span>
      </footer>
    </main>
  );
}
