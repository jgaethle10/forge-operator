import React, { FormEvent, useEffect, useMemo, useState } from 'react';

type Brain = {
  brain_key: string;
  display_name: string;
  person_type: string;
  sport_or_domain?: string;
  anchor_organization?: string;
  ownership_model: string;
  portability_state: string;
  consent_state: string;
  identity_assurance: string;
  goals?: string[];
};

function api(path: string, options: RequestInit = {}) {
  return fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function TokenGate({ token, setToken }: { token: string; setToken: (value: string) => void }) {
  return (
    <section className="people-shell people-centered">
      <div className="people-card people-narrow">
        <div className="people-kicker">SYSTEMIA · PEOPLE LAYER</div>
        <h1>Owned runtime access</h1>
        <p>
          This operator surface is now served by Forge/Systemia. Enter the private People admin token for this browser session.
          The token is kept in session storage only.
        </p>
        <input
          className="people-input"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="People admin token"
          autoComplete="off"
        />
      </div>
    </section>
  );
}

function OperatorPeopleLayer() {
  const [token, setTokenState] = useState(() => sessionStorage.getItem('evercraft_people_admin_token') || '');
  const [brains, setBrains] = useState<Brain[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [personConfirmation, setPersonConfirmation] = useState('');
  const [shareScopes, setShareScopes] = useState('goals, opportunities');
  const [memoryForm, setMemoryForm] = useState({ title: '', body: '', memory_type: 'goal', sensitivity: 'private' });
  const [relationshipForm, setRelationshipForm] = useState({ counterpart_name: '', counterpart_type: 'advisor', purpose: '' });
  const [opportunityForm, setOpportunityForm] = useState({ title: '', opportunity_type: 'business', summary: '', fit_rationale: '' });
  const [form, setForm] = useState({
    display_name: '',
    person_type: 'athlete',
    sport_or_domain: '',
    anchor_organization: '',
    goals: '',
  });

  const selected = useMemo(
    () => brains.find((brain) => brain.brain_key === selectedKey) || brains[0] || null,
    [brains, selectedKey],
  );

  function setToken(value: string) {
    setTokenState(value);
    if (value) sessionStorage.setItem('evercraft_people_admin_token', value);
    else sessionStorage.removeItem('evercraft_people_admin_token');
  }

  async function load() {
    if (!token) return;
    setBusy('load');
    setError('');
    try {
      const response = await api('/api/people/brains', {
        headers: { authorization: 'Bearer ' + token },
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'People Layer could not load.');
      setBrains(body.brains || []);
      if (!selectedKey && body.brains?.[0]?.brain_key) setSelectedKey(body.brains[0].brain_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function loadSnapshot(brainKey: string) {
    if (!token || !brainKey) {
      setSnapshot(null);
      return;
    }
    try {
      const response = await api('/api/people/brains/' + encodeURIComponent(brainKey), {
        headers: { authorization: 'Bearer ' + token },
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Brain snapshot could not load.');
      setSnapshot(body.snapshot || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (token && selected?.brain_key) loadSnapshot(selected.brain_key);
    else setSnapshot(null);
  }, [token, selected?.brain_key]);

  async function postOwned(path: string, payload: any = {}) {
    const response = await api(path, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || !body?.ok) throw new Error(body?.error || 'People action failed.');
    if (selected?.brain_key) await loadSnapshot(selected.brain_key);
    return body;
  }

  async function createBrain(event: FormEvent) {
    event.preventDefault();
    setBusy('create');
    setError('');
    try {
      const response = await api('/api/people/brains', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
        body: JSON.stringify({
          ...form,
          goals: form.goals.split('\n').map((item) => item.trim()).filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Unable to create brain.');
      setForm({ display_name: '', person_type: 'athlete', sport_or_domain: '', anchor_organization: '', goals: '' });
      await load();
      setSelectedKey(body.brain?.brain_key || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function createInvite() {
    if (!selected) return;
    setBusy('invite');
    setError('');
    try {
      const response = await api('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/invite', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
        body: JSON.stringify({ ttl_hours: 48 }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Unable to create invite.');
      setInviteUrl(window.location.origin + body.invite.consent_path);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function createEmailChallenge() {
    if (!selected || !identityEmail.trim()) return;
    setBusy('verify');
    setError('');
    setVerificationStatus('');
    try {
      const response = await api('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/email-challenge', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
        body: JSON.stringify({ email: identityEmail.trim(), ttl_minutes: 30 }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Unable to create verification.');
      setVerificationStatus('Trusted provider accepted the message. Receipt: ' + String(body.delivery?.delivery_receipt_key || 'recorded') + '. Only the recipient receives the link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function exportBrain() {
    if (!selected) return;
    setBusy('export');
    setError('');
    try {
      const response = await api('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/export', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
        body: JSON.stringify({ person_confirmation_ref: personConfirmation.trim() }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Unable to export brain.');
      const blob = new Blob([JSON.stringify(body.export.package, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = selected.brain_key + '.json';
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function createMemory(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    try {
      await postOwned('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/memories', {
        ...memoryForm,
        evidence_state: 'person_stated',
      });
      setMemoryForm({ title: '', body: '', memory_type: 'goal', sensitivity: 'private' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createRelationship(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    try {
      await postOwned('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/relationships', relationshipForm);
      setRelationshipForm({ counterpart_name: '', counterpart_type: 'advisor', purpose: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function shareAction(relationshipKey: string, action: 'grant' | 'revoke') {
    if (!selected) return;
    setError('');
    try {
      await postOwned(
        '/api/people/brains/' + encodeURIComponent(selected.brain_key) +
        '/relationships/' + encodeURIComponent(relationshipKey) + '/' + action,
        {
          scopes: action === 'grant' ? shareScopes.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
          person_confirmation_ref: personConfirmation.trim(),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createOpportunity(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    try {
      await postOwned('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/opportunities', {
        ...opportunityForm,
        evidence_state: 'unknown',
      });
      setOpportunityForm({ title: '', opportunity_type: 'business', summary: '', fit_rationale: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function opportunityAuthority(opportunityKey: string, authority_state: 'authorized' | 'declined') {
    if (!selected) return;
    setError('');
    try {
      await postOwned(
        '/api/people/brains/' + encodeURIComponent(selected.brain_key) +
        '/opportunities/' + encodeURIComponent(opportunityKey) + '/authority',
        { authority_state, person_confirmation_ref: personConfirmation.trim() },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function revokeConsent() {
    if (!selected) return;
    setError('');
    try {
      await postOwned('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/revoke-consent', {
        person_confirmation_ref: personConfirmation.trim(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function requestDelete() {
    if (!selected) return;
    setError('');
    try {
      const body = await postOwned('/api/people/brains/' + encodeURIComponent(selected.brain_key) + '/delete-request', {
        person_confirmation_ref: personConfirmation.trim(),
      });
      setError('Delete request state: ' + body.request.status + '. Final destruction still requires exact owner confirmation.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!token) return <TokenGate token={token} setToken={setToken} />;

  return (
    <main className="people-shell">
      <header className="people-head">
        <div>
          <div className="people-kicker">EVERCRAFT · SYSTEMIA · OWNED RUNTIME</div>
          <h1>People Layer</h1>
          <p>
            Portable intelligence belongs to the person. Teams, agents, sponsors, employers, and communities receive only explicit,
            revocable scopes.
          </p>
        </div>
        <div className="people-head-actions">
          <span className="people-badge people-good">Forge owned</span>
          <span className="people-badge">Base44 hot path: none</span>
          <button className="people-button quiet" onClick={() => setToken('')}>Lock</button>
        </div>
      </header>

      {error && <div className="people-error">{error}</div>}

      <section className="people-layout">
        <aside className="people-stack">
          <div className="people-card">
            <div className="people-card-title">Brains</div>
            <div className="people-list">
              {brains.length ? brains.map((brain) => (
                <button
                  key={brain.brain_key}
                  className={'people-brain-row ' + (selected?.brain_key === brain.brain_key ? 'active' : '')}
                  onClick={() => setSelectedKey(brain.brain_key)}
                >
                  <strong>{brain.display_name}</strong>
                  <span>{brain.person_type} · {brain.sport_or_domain || 'domain open'}</span>
                  <small>{brain.consent_state} · {brain.identity_assurance}</small>
                </button>
              )) : <div className="people-muted">No owned People brains yet.</div>}
            </div>
          </div>

          <form className="people-card people-stack" onSubmit={createBrain}>
            <div className="people-card-title">Provision pilot brain</div>
            <input className="people-input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Person name" required />
            <div className="people-two">
              <select className="people-input" value={form.person_type} onChange={(e) => setForm({ ...form, person_type: e.target.value })}>
                {['athlete', 'creator', 'superfan', 'coach', 'staff', 'other'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <input className="people-input" value={form.sport_or_domain} onChange={(e) => setForm({ ...form, sport_or_domain: e.target.value })} placeholder="Sport / domain" />
            </div>
            <input className="people-input" value={form.anchor_organization} onChange={(e) => setForm({ ...form, anchor_organization: e.target.value })} placeholder="Current team / community" />
            <textarea className="people-input" value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} placeholder={'Goals, one per line\nBuild post-career business\nLaunch youth camp'} rows={4} />
            <button className="people-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create owned brain'}</button>
          </form>
        </aside>

        <section className="people-stack">
          {!selected ? (
            <div className="people-card people-empty">Create a brain to open the owned cockpit.</div>
          ) : (
            <>
              <div className="people-card">
                <div className="people-profile">
                  <div>
                    <div className="people-badges">
                      <span className="people-badge">{selected.person_type}</span>
                      <span className="people-badge people-good">{selected.ownership_model}</span>
                      <span className="people-badge">{selected.portability_state}</span>
                    </div>
                    <h2>{selected.display_name}</h2>
                    <p>{selected.sport_or_domain || 'Domain open'}{selected.anchor_organization ? ' · ' + selected.anchor_organization : ''}</p>
                  </div>
                  <div className="people-status">
                    <span>Consent</span>
                    <strong>{selected.consent_state}</strong>
                    <small>{selected.identity_assurance}</small>
                  </div>
                </div>
                <div className="people-principles">
                  <article><strong>Person sovereign</strong><p>The brain follows the person across organizations and career stages.</p></article>
                  <article><strong>Scoped access</strong><p>Relationships never inherit blanket access by proximity.</p></article>
                  <article><strong>Discovery ≠ authority</strong><p>Opportunity discovery cannot silently send, book, charge, or disclose.</p></article>
                </div>
              </div>

              <div className="people-card people-stack">
                <div className="people-card-title">Ownership controls</div>
                <div className="people-actions">
                  <button className="people-button" onClick={createInvite} disabled={Boolean(busy)}>Create 48-hour consent invite</button>
                  <button className="people-button quiet" onClick={exportBrain} disabled={Boolean(busy)}>Export brain</button>
                  <button className="people-button quiet" onClick={revokeConsent} disabled={Boolean(busy) || selected.consent_state !== 'consented'}>Revoke consent</button>
                  <button className="people-button quiet" onClick={requestDelete} disabled={Boolean(busy)}>Request deletion</button>
                </div>
                <input
                  className="people-input"
                  value={personConfirmation}
                  onChange={(e) => setPersonConfirmation(e.target.value)}
                  placeholder="Person confirmation reference"
                />
                {inviteUrl && (
                  <div className="people-linkbox">
                    <input className="people-input" readOnly value={inviteUrl} />
                    <button className="people-button quiet" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button>
                  </div>
                )}

                <div className="people-divider" />
                <div className="people-card-title">Verified email identity</div>
                <p className="people-muted">Email verification is separate from Systemia operator identity. The raw address is never persisted in the People state.</p>
                <div className="people-linkbox">
                  <input className="people-input" type="email" value={identityEmail} onChange={(e) => setIdentityEmail(e.target.value)} placeholder="Pilot email address" />
                  <button className="people-button quiet" onClick={createEmailChallenge} disabled={Boolean(busy) || selected.consent_state !== 'consented'}>Create 30-minute verification</button>
                </div>
                {verificationStatus && (
                  <div className="people-promise">
                    <strong>Trusted provider accepted message</strong>
                    <p className="people-muted">{verificationStatus}</p>
                  </div>
                )}
              </div>

              <div className="people-two">
                <form className="people-card people-stack" onSubmit={createMemory}>
                  <div className="people-card-title">Memory</div>
                  <input className="people-input" value={memoryForm.title} onChange={(e) => setMemoryForm({ ...memoryForm, title: e.target.value })} placeholder="Memory title" required />
                  <textarea className="people-input" rows={3} value={memoryForm.body} onChange={(e) => setMemoryForm({ ...memoryForm, body: e.target.value })} placeholder="What should this brain remember?" />
                  <div className="people-two">
                    <select className="people-input" value={memoryForm.memory_type} onChange={(e) => setMemoryForm({ ...memoryForm, memory_type: e.target.value })}>
                      {['goal','preference','career','performance','relationship','story','commitment','logistics','collection','fan_history','other'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select className="people-input" value={memoryForm.sensitivity} onChange={(e) => setMemoryForm({ ...memoryForm, sensitivity: e.target.value })}>
                      {['private','trusted_circle','shareable','public_safe'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <button className="people-button quiet">Add memory</button>
                  {(snapshot?.memories || []).map((item: any) => (
                    <div className="people-promise" key={item.memory_key}>
                      <strong>{item.title}</strong>
                      <div className="people-muted">{item.memory_type} · {item.sensitivity} · {item.evidence_state}</div>
                      {item.body && <div>{item.body}</div>}
                    </div>
                  ))}
                </form>

                <form className="people-card people-stack" onSubmit={createRelationship}>
                  <div className="people-card-title">Trusted graph</div>
                  <input className="people-input" value={relationshipForm.counterpart_name} onChange={(e) => setRelationshipForm({ ...relationshipForm, counterpart_name: e.target.value })} placeholder="Person / organization" required />
                  <select className="people-input" value={relationshipForm.counterpart_type} onChange={(e) => setRelationshipForm({ ...relationshipForm, counterpart_type: e.target.value })}>
                    {['agent','team','coach','trainer','family','sponsor','brand','creator','fan_group','vendor','advisor','other'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <textarea className="people-input" rows={2} value={relationshipForm.purpose} onChange={(e) => setRelationshipForm({ ...relationshipForm, purpose: e.target.value })} placeholder="Why does this relationship exist?" />
                  <button className="people-button quiet">Propose relationship</button>
                  <input className="people-input" value={shareScopes} onChange={(e) => setShareScopes(e.target.value)} placeholder="Share scopes, comma separated" />
                  {(snapshot?.relationships || []).map((item: any) => (
                    <div className="people-promise" key={item.relationship_key}>
                      <strong>{item.counterpart_name}</strong>
                      <div className="people-muted">{item.counterpart_type} · {item.access_state}</div>
                      <div className="people-muted">{item.access_scope?.length ? item.access_scope.join(' · ') : 'No access scopes'}</div>
                      <div className="people-actions">
                        {item.access_state === 'granted' ? (
                          <button type="button" className="people-button quiet" onClick={() => shareAction(item.relationship_key, 'revoke')}>Revoke access</button>
                        ) : (
                          <button type="button" className="people-button quiet" disabled={selected.consent_state !== 'consented'} onClick={() => shareAction(item.relationship_key, 'grant')}>Grant scoped access</button>
                        )}
                      </div>
                    </div>
                  ))}
                </form>
              </div>

              <form className="people-card people-stack" onSubmit={createOpportunity}>
                <div className="people-card-title">Opportunity queue</div>
                <p className="people-muted">Discovery is evidence, not permission to contact, book, pay, disclose, or execute.</p>
                <div className="people-two">
                  <input className="people-input" value={opportunityForm.title} onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })} placeholder="Opportunity" required />
                  <select className="people-input" value={opportunityForm.opportunity_type} onChange={(e) => setOpportunityForm({ ...opportunityForm, opportunity_type: e.target.value })}>
                    {['sponsorship','appearance','camp','content','travel','collectible','community','business','education','charity','career','other'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <input className="people-input" value={opportunityForm.summary} onChange={(e) => setOpportunityForm({ ...opportunityForm, summary: e.target.value })} placeholder="What is it?" />
                <input className="people-input" value={opportunityForm.fit_rationale} onChange={(e) => setOpportunityForm({ ...opportunityForm, fit_rationale: e.target.value })} placeholder="Why this person?" />
                <button className="people-button quiet">Add discover-only opportunity</button>
                {(snapshot?.opportunities || []).map((item: any) => (
                  <div className="people-promise" key={item.opportunity_key}>
                    <strong>{item.title}</strong>
                    <div className="people-muted">{item.opportunity_type} · {item.authority_state} · {item.status}</div>
                    {item.summary && <div>{item.summary}</div>}
                    {item.fit_rationale && <div className="people-muted">Fit: {item.fit_rationale}</div>}
                    {item.authority_state === 'discover_only' && (
                      <div className="people-actions">
                        <button type="button" className="people-button quiet" onClick={() => opportunityAuthority(item.opportunity_key, 'authorized')}>Authorize</button>
                        <button type="button" className="people-button quiet" onClick={() => opportunityAuthority(item.opportunity_key, 'declined')}>Decline</button>
                      </div>
                    )}
                  </div>
                ))}
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function ConsentPortal() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [ownership, setOwnership] = useState(false);
  const [scopes, setScopes] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    api('/api/people/consent/inspect?token=' + encodeURIComponent(token))
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error(body?.error || 'Invite unavailable.');
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [token]);

  async function accept() {
    setError('');
    try {
      const response = await api('/api/people/consent/accept', {
        method: 'POST',
        body: JSON.stringify({ token, accept_ownership: ownership, accept_scopes: scopes, confirmation_text: confirmation }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Consent could not be recorded.');
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="people-shell people-centered">
      <section className="people-card people-person">
        <div className="people-kicker">EVERCRAFT PEOPLE LAYER · OWNED RUNTIME</div>
        <h1>{accepted ? 'Your consent is recorded.' : (data?.brain?.display_name ? data.brain.display_name + ', this brain belongs to you.' : 'Private ownership invitation')}</h1>
        <p>This portable intelligence layer belongs to the person, not a team, sponsor, employer, agent, or software platform.</p>
        {data?.promises?.map((promise: string) => <div className="people-promise" key={promise}>✓ {promise}</div>)}
        {!accepted && data && (
          <div className="people-stack">
            <label className="people-check"><input type="checkbox" checked={ownership} onChange={(e) => setOwnership(e.target.checked)} /> I understand this brain is intended to remain person-owned and portable.</label>
            <label className="people-check"><input type="checkbox" checked={scopes} onChange={(e) => setScopes(e.target.checked)} /> I consent to the requested scopes: {(data.invite?.scopes || []).join(', ')}.</label>
            <input className="people-input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type "I ACCEPT"' />
            <button className="people-button" onClick={accept}>Accept and create my consent receipt</button>
          </div>
        )}
        {error && <div className="people-error">{error}</div>}
      </section>
    </main>
  );
}

function EmailVerificationPortal() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    api('/api/people/verify-email/inspect?token=' + encodeURIComponent(token))
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error(body?.error || 'Verification unavailable.');
        setData(body);
        if (body.already_verified) setVerified(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [token]);

  async function verify() {
    setError('');
    try {
      const response = await api('/api/people/verify-email/verify', {
        method: 'POST',
        body: JSON.stringify({ token, confirmation_text: confirmation }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Email could not be verified.');
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="people-shell people-centered">
      <section className="people-card people-person">
        <div className="people-kicker">EVERCRAFT PEOPLE LAYER · EMAIL IDENTITY</div>
        <h1>{verified ? 'Email ownership verified.' : (data?.person?.display_name ? data.person.display_name + ', prove this mailbox is yours.' : 'Email verification')}</h1>
        <p>{data?.email_hint ? 'Challenge destination: ' + data.email_hint + '. ' : ''}Successful redemption upgrades this brain to verified_email without creating a Systemia operator account.</p>
        {!verified && data && (
          <div className="people-stack">
            <input className="people-input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type "VERIFY MY EMAIL"' />
            <button className="people-button" onClick={verify}>Verify my email</button>
          </div>
        )}
        {error && <div className="people-error">{error}</div>}
      </section>
    </main>
  );
}

export default function PeopleLayer() {
  if (window.location.pathname.startsWith('/people/consent')) return <ConsentPortal />;
  if (window.location.pathname.startsWith('/people/verify-email')) return <EmailVerificationPortal />;
  return <OperatorPeopleLayer />;
}
