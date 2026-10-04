function esc(value=''){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
export function renderRepairNavigator({query='',result=null}={}){
  const safeQuery=esc(query);
  const body=!query
    ? '<div class="empty">Describe what is broken, what it is attached to, and what you have already observed.</div>'
    : !result?.supported
      ? '<div class="empty"><strong>No Repair Graph pattern matched yet.</strong><p>Add the asset type, symptom, model/year if known, and anything you already checked. Fabric will not invent a diagnosis.</p></div>'
      : `<section class="result">
          <div class="badge">${esc(result.domain)} · read-only triage</div>
          <h2>${esc(result.problem)}</h2>
          <div class="safety"><strong>Safety gate:</strong> ${esc(result.safety?.note||'Use appropriate safety precautions.')}</div>
          <h3>Start with these checks</h3>
          <ol>${(result.checks||[]).map(x=>'<li>'+esc(x.label)+'</li>').join('')}</ol>
          <h3>Leading hypotheses</h3>
          ${(result.hypotheses||[]).map(x=>`<article><strong>${esc(x.cause)}</strong><p>Evidence to confirm: ${esc((x.evidence_to_confirm||[]).join('; '))}</p><span>${esc(x.confidence_class)}</span></article>`).join('')}
          <p class="next">${esc(result.next_step||'')}</p>
          <p class="boundary">This is evidence-aware triage, not proof of diagnosis or fitment. No purchase or external action was taken.</p>
        </section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07101f"><title>Evercraft Repair Navigator</title><style>
  :root{color-scheme:dark;--bg:#050914;--panel:#0c1629;--line:#203250;--text:#f7f9fc;--muted:#9fb0c8;--accent:#5fb0ff;--green:#72e7b4}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,sans-serif}.wrap{width:min(760px,calc(100% - 28px));margin:auto;padding:28px 0 60px}
  a{color:#9ec8ff}h1{font-size:clamp(42px,10vw,70px);letter-spacing:-.055em;line-height:.95;margin:28px 0 18px}.lede{color:#c6d3e4;font-size:18px;line-height:1.55}
  form,.result,.empty{border:1px solid var(--line);background:var(--panel);border-radius:20px;padding:18px;margin-top:24px}textarea{width:100%;min-height:150px;border:0;background:transparent;color:var(--text);font:inherit;font-size:18px;resize:vertical;outline:none}
  button{width:100%;border:0;border-radius:14px;padding:16px;font-weight:800;font-size:18px;color:white;background:linear-gradient(135deg,#1c6cff,#5fb0ff)}.badge{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:#bcd5f8}
  h2{font-size:30px;margin:18px 0}h3{margin-top:26px}.result li,.result p,.empty{color:#c5d2e4;line-height:1.55}.result article{border-top:1px solid var(--line);padding:14px 0}.result article span{font-size:12px;color:var(--muted)}.safety{border-left:3px solid #f0c36a;padding:12px 14px;background:#131729;border-radius:8px}.boundary{font-size:13px;color:var(--muted)!important}.back{display:inline-block;text-decoration:none;margin-bottom:10px}
  </style></head><body><main class="wrap"><a class="back" href="/mobile">← Evercraft Mobile</a><h1>Repair Navigator</h1><p class="lede">Start with the symptom. Repair Graph narrows plausible causes, safe evidence checks, and the next useful step. Parts only enter the path when the evidence points to a component.</p><form method="get" action="/repair"><textarea name="q" placeholder="Example: My headlight is out and I think it might be the wire">${safeQuery}</textarea><button type="submit">Diagnose the path</button></form>${body}</main></body></html>`;
}
