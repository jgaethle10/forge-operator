const esc = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status = result => result?.result?.status === 'completed' ? 'completed' : result?.result?.status === 'completed_with_holds' ? 'held' : 'blocked';
const roleLabel = role => ({research:'Research',creative:'Creative',production:'Production',review:'Quality Review'}[role] || role);
export function renderLocalWorkroom(receipt) {
  if (receipt?.schema !== 'evercraft.work-saban.local-commercial-run-receipt.v1' ||
      !Array.isArray(receipt.worker_receipts)) throw Error('work_saban_workroom_invalid_receipt');
  const roles = receipt.worker_receipts.map(r => {
    const state = status(r);
    const findings = r?.result?.findings || [];
    const summary = JSON.stringify(r?.result?.output || {}, null, 2);
    return '<article class="role"><div class="role-top"><span class="dot '+esc(state)+'"></span><h2>'+esc(roleLabel(r.role))+'</h2><span class="status '+esc(state)+'">'+esc(state)+'</span></div>'+
      '<p class="role-sub">Registered worker receipt • '+esc(r.role)+'</p><div class="details"><strong>Findings: '+esc(findings.length)+'</strong>'+
      '<div class="small">'+(findings.length?findings.map(f=>'<p>• '+esc(f)+'</p>').join(''):'<p>No worker-level findings</p>')+'</div></div>'+
      '<details><summary>Inspect actual draft output</summary><pre>'+esc(summary)+'</pre></details></article>';
  }).join('');
  const holds = receipt.reconciliation?.findings || [];
  const receiptHash=String(receipt.receipt_sha256||'not_provided');
  return ['<!doctype html>','<html lang="en"><head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    '<title>Work Saban • Local Workroom</title>',
    '<style>',
    ':root{color-scheme:dark;font-family:Inter,system-ui,Arial,sans-serif;background:#08121c;color:#e6f2f6}',
    '*{box-sizing:border-box}body{margin:0;padding:24px 18px 50px;background:radial-gradient(ellipse at top,#15364a 0,#08121c 56%)}',
    'main{max-width:1040px;margin:0 auto}.eyebrow{font-size:12px;letter-spacing:.19em;color:#78e9ce;font-weight:750}',
    'h1{font-size:clamp(30px,5vw,56px);line-height:1.05;letter-spacing:-.035em;margin:10px 0 16px}',
    '.sub{color:#a7bac8;max-width:710px;line-height:1.55}.banner{border:1px solid #285564;background:#102b38;',
    'border-radius:16px;padding:18px 20px;margin:28px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '.pill{border-radius:999px;background:#bd8c331e;color:#ffd98a;border:1px solid #8b6839;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:.06em}',
    '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:24px 0}',
    '.role{min-width:0;background:#10212d;border:1px solid #294152;border-radius:16px;padding:20px}',
    '.role-top{display:flex;align-items:center;gap:10px}.role h2{font-size:19px;letter-spacing:-.02em;margin:0;flex:1}',
    '.dot{display:inline-block;width:10px;height:10px;border-radius:50%}.dot.completed{background:#66e5a8}',
    '.dot.held{background:#ffcb69}.dot.blocked{background:#ee8799}',
    '.status{text-transform:uppercase;letter-spacing:.07em;font-size:10px;font-weight:750}.status.held{color:#ffcb69}',
    '.status.completed{color:#66e5a8}.status.blocked{color:#ee8799}',
    '.role-sub{color:#89a1b3;font-size:12px;margin:14px 0 22px}.details{background:#0b1821;border-radius:12px;padding:14px}',
    '.details strong{font-size:13px}.small{color:#b6c7d1;font-size:12px;line-height:1.6;overflow-wrap:anywhere}',
    '.small p{margin:7px 0}details{margin-top:17px}summary{cursor:pointer;color:#90f0e0;font-size:13px}',
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#07131c;border:1px solid #264454;padding:12px;border-radius:10px;max-height:390px;overflow:auto}',
    '.foot{color:#8ea8b7;font-size:12px;line-height:1.7;padding-top:20px;border-top:1px solid #244051}',
    '.mono{font-family:ui-monospace,monospace;overflow-wrap:anywhere}',
    '@media(max-width:650px){body{padding:18px 14px 32px}.grid{grid-template-columns:1fr}.role{padding:16px}}',
    '</style></head><body><main>',
    '<p class="eyebrow">EVERCRAFT / WORK SABAN / LOCAL WORKROOM</p>',
    '<h1>Proof of work, not theater.</h1>',
    '<p class="sub">This read-only report renders actual registered-worker receipts from a local commercial-draft run. No animations, phantom team activity, or implied deployment.</p>',
    '<section class="banner"><span class="pill">'+esc(receipt.state)+'</span><span>'+esc(receipt.role_count)+' local role receipts • '+esc(holds.length)+' QA findings • No publication</span></section>',
    '<div class="grid">'+roles+'</div>',
    '<p class="foot"><strong>Execution boundary:</strong> deterministic local drafts only. No model agents invoked, no video/audio rendered, no external effects, no customer delivery.<br/>',
    '<strong>Next gate:</strong> '+esc(receipt.next_gate)+'<br/>',
    '<strong>Receipt SHA-256:</strong> <span class="mono">'+esc(receiptHash)+'</span></p>',
    '</main></body></html>'
  ].join('\n');
}


// Extension view: rendered only from finished registered-worker receipts.
// It does not estimate activity, stream fabricated progress, or grant release authority.
export function renderFallenCouncilWorkroom(preview) {
  if (preview?.schema !== 'evercraft.work-saban.fallen-council-preview.v1' ||
      preview?.local_work?.schema !== 'evercraft.work-saban.local-commercial-run-receipt.v1' ||
      !Array.isArray(preview.council_reconciliation?.blueprints) ||
      !Array.isArray(preview.council_worker_receipts) ||
      preview.generated_media !== false || preview.provider_calls_performed !== 0) {
    throw Error('work_saban_fallen_workroom_invalid_or_unverified_receipt');
  }
  const count = preview.council_worker_receipts.length;
  const blocks = preview.council_reconciliation.blueprints.map((shot, i) => {
    const findings = shot.findings || [];
    const crewCount = preview.council_worker_receipts.filter(r => r?.result?.shot_id === shot.shot_id).length;
    const directorNotes = shot.creative_genome || {};
    return '<article class="role"><div class="role-top"><span class="dot held"></span>'+
      '<h2>Shot '+esc(i+1)+'</h2><span class="status held">Source coverage held</span></div>'+
      '<p class="role-sub">'+esc(crewCount)+' completed role invocations • '+esc(shot.shot_id)+'</p>'+
      '<div class="details"><strong>Direction recorded; media not produced</strong><div class="small">'+
      '<p>Findings: '+esc(findings.length)+'</p><p>Evidence and footage must be independently verified.</p></div></div>'+
      '<details><summary>Inspect actual creative genome and rejection criteria</summary>'+
      '<pre>'+esc(JSON.stringify({creative_genome:directorNotes,rejection_contract:shot.rejection_contract,
        findings},null,2))+'</pre></details></article>';
  }).join('');
  const section = '<section aria-label="Fallen Creative Council"><p class="eyebrow">FALLEN / CREATIVE COUNCIL</p>'+
    '<h2>Four shots. Fourteen disciplines.</h2>'+
    '<p class="sub">'+esc(count)+' registered council worker receipts. Story, visual evidence, camera, voice, score, edit, mix, brand and beauty direction are recorded. Source coverage held. No model provider or renderer called.</p>'+
    '<div class="grid">'+blocks+'</div>'+
    '<p class="foot">Council source state: <strong>Source coverage held</strong>. No usable footage certified; no video, voice or music generated. All creative directions are drafts awaiting evidence, asset rights, and owner review.</p>'+
    '</section>';
  const html = renderLocalWorkroom(preview.local_work);
  if (!html.includes('</main></body></html>')) {
    throw Error('work_saban_fallen_workroom_template_invalid');
  }
  return html.replace('</main></body></html>', section+'</main></body></html>');
}
