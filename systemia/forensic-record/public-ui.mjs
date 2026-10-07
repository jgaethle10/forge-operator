export function forensicPublicHtml(){
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="The Forensic Record: a source-linked public record research archive.">
  <title>The Forensic Record</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="content-gate" class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
    <div class="gate-card">
      <div class="eyebrow">Content notice</div>
      <h1 id="gate-title">This archive contains disturbing public-record material.</h1>
      <p>Some records discuss sexual abuse, exploitation, trafficking allegations, violence, and other sensitive subjects. Source-linked records show what a source contains. A mention or association is not evidence of wrongdoing.</p>
      <div class="gate-actions">
        <button id="enter-archive" class="button primary">I understand. Enter the archive.</button>
        <button id="leave-archive" class="button ghost">Go back</button>
      </div>
    </div>
  </div>

  <header class="site-header">
    <a class="brand" href="/" aria-label="The Forensic Record home">
      <span class="brand-mark">FR</span>
      <span>
        <strong>The Forensic Record</strong>
        <small>Files Companion</small>
      </span>
    </a>
    <div class="header-meta">
      <span class="live-dot"></span>
      <span>Owned read-only staging archive</span>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="eyebrow">Source-linked public record research</div>
      <h1>Search the record.<br><span>Keep the evidence boundary intact.</span></h1>
      <p class="hero-copy">Findings stay attached to source documents, page references, truth labels, and the context needed to distinguish evidence from allegation, testimony, association, and adjudicated fact.</p>

      <form id="search-form" class="search-panel">
        <label for="search-input">Search findings</label>
        <div class="search-row">
          <input id="search-input" autocomplete="off" maxlength="160" placeholder="Keyword, document, or finding number" aria-describedby="search-help">
          <button class="button primary" type="submit">Search archive</button>
        </div>
        <div id="search-help" class="search-help">Enter a finding number for an exact lookup, or two or more characters for full-text search.</div>
      </form>

      <div id="stats" class="stats" aria-live="polite">
        <div><strong>—</strong><span>finding rows</span></div>
        <div><strong>—</strong><span>unique findings</span></div>
        <div><strong>—</strong><span>source documents</span></div>
        <div><strong>—</strong><span>citation gaps</span></div>
      </div>
    </section>

    <section class="boundary">
      <div>
        <div class="eyebrow">Evidence rule</div>
        <h2>Association is not culpability.</h2>
      </div>
      <p>This archive reports what source material says and where it says it. Names, contact, travel, testimony, allegations, investigative notes, and court findings are different kinds of evidence and are not collapsed into one claim.</p>
    </section>

    <section class="results-section">
      <div class="section-heading">
        <div>
          <div class="eyebrow">Archive results</div>
          <h2 id="results-title">Ready to search</h2>
        </div>
        <div id="result-count" class="result-count"></div>
      </div>
      <div id="status" class="status">Search the archive to begin.</div>
      <div id="results" class="results"></div>
    </section>
  </main>

  <footer>
    <strong>The Forensic Record</strong>
    <p>Read-only staging surface. Canonical filescompanion.com cutover is not authorized by this staging build.</p>
  </footer>

  <script src="/app.js" defer></script>
</body>
</html>`;
}

export function forensicPublicCss(){
  return `:root{
  color-scheme:dark;
  --ink:#f4efe3;
  --muted:#a7a298;
  --bg:#0d0e10;
  --panel:#15171a;
  --panel2:#1b1e22;
  --line:#2b2f35;
  --accent:#d9b96e;
  --danger:#d27a6b;
  --ok:#83b69a;
  --max:1180px;
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:
  radial-gradient(circle at 80% -10%,rgba(217,185,110,.12),transparent 38rem),
  linear-gradient(180deg,#111214 0,#0d0e10 45rem);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}
button,input{font:inherit}
.site-header{height:78px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - var(--max))/2));position:sticky;top:0;background:rgba(13,14,16,.9);backdrop-filter:blur(18px);z-index:10}
.brand{display:flex;gap:12px;align-items:center;text-decoration:none}
.brand-mark{width:40px;height:40px;border:1px solid #575047;display:grid;place-items:center;font:700 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;color:var(--accent)}
.brand strong,.brand small{display:block}.brand strong{font-family:Georgia,serif;font-size:18px}.brand small{color:var(--muted);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.header-meta{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 5px rgba(131,182,154,.08)}
main{max-width:var(--max);margin:0 auto;padding:0 24px}
.hero{padding:96px 0 54px}
.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:700;color:var(--accent)}
.hero h1{font:500 clamp(46px,7vw,88px)/.98 Georgia,serif;letter-spacing:-.045em;max-width:1000px;margin:20px 0 26px}
.hero h1 span{color:#8f8c84}
.hero-copy{max-width:760px;color:#c7c2b8;font-size:18px}
.search-panel{margin-top:44px;padding:18px;border:1px solid var(--line);background:rgba(21,23,26,.82)}
.search-panel label{display:block;font-weight:700;margin-bottom:10px}
.search-row{display:grid;grid-template-columns:1fr auto;gap:10px}
input{width:100%;background:#0e1012;border:1px solid #383d44;color:var(--ink);padding:14px 15px;outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(217,185,110,.08)}
.button{border:1px solid var(--line);padding:13px 18px;cursor:pointer;font-weight:700}
.button.primary{background:var(--accent);border-color:var(--accent);color:#17130c}
.button.ghost{background:transparent;color:var(--ink)}
.search-help{color:var(--muted);font-size:12px;margin-top:9px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:30px;border-top:1px solid var(--line);border-left:1px solid var(--line)}
.stats div{padding:22px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(15,16,18,.5)}
.stats strong,.stats span{display:block}.stats strong{font:600 28px/1 Georgia,serif}.stats span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin-top:8px}
.boundary{display:grid;grid-template-columns:.75fr 1.25fr;gap:48px;padding:42px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.boundary h2{font:500 34px/1.1 Georgia,serif;margin:10px 0}.boundary p{color:#c7c2b8;margin:0}
.results-section{padding:62px 0 100px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:26px}.section-heading h2{font:500 38px/1 Georgia,serif;margin:9px 0 0}.result-count{color:var(--muted);font-size:13px}
.status{border:1px dashed #393d43;padding:22px;color:var(--muted);background:#111316}.status.hidden{display:none}
.results{display:grid;gap:14px}
.finding{border:1px solid var(--line);background:linear-gradient(180deg,#17191c,#131517);padding:24px}
.finding-head{display:flex;justify-content:space-between;gap:18px;align-items:start}
.finding-number{font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);letter-spacing:.08em;text-transform:uppercase}
.finding h3{font:500 25px/1.2 Georgia,serif;margin:10px 0 0}
.truth{font-size:10px;letter-spacing:.12em;text-transform:uppercase;border:1px solid #454a50;padding:6px 8px;color:#d4d0c8;white-space:nowrap}
.finding-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin:15px 0;color:var(--muted);font-size:12px}
.quote{border-left:2px solid var(--accent);padding:2px 0 2px 16px;color:#ded9cf;margin:20px 0;white-space:pre-wrap}
.significance{color:#bcb7ad}.source-link{display:inline-flex;margin-top:15px;color:var(--accent);font-size:12px;text-decoration:none}.source-link:hover{text-decoration:underline}
footer{max-width:var(--max);margin:0 auto;padding:32px 24px 60px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}footer strong{color:var(--ink)}
.gate{position:fixed;inset:0;background:rgba(5,6,7,.96);z-index:100;display:grid;place-items:center;padding:24px}.gate.hidden{display:none}.gate-card{max-width:720px;border:1px solid #3b3d40;background:#131518;padding:38px}.gate-card h1{font:500 38px/1.1 Georgia,serif;margin:12px 0 18px}.gate-card p{color:#c2beb5}.gate-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
@media(max-width:760px){.site-header{padding:0 16px}.header-meta{display:none}main{padding:0 16px}.hero{padding-top:68px}.search-row{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.boundary{grid-template-columns:1fr;gap:16px}.finding-head{display:block}.truth{display:inline-block;margin-top:12px}.gate-card{padding:26px}}
`;
}

export function forensicPublicJs(){
  return `(()=>{
  const gate=document.getElementById('content-gate');
  const enter=document.getElementById('enter-archive');
  const leave=document.getElementById('leave-archive');
  const form=document.getElementById('search-form');
  const input=document.getElementById('search-input');
  const results=document.getElementById('results');
  const status=document.getElementById('status');
  const title=document.getElementById('results-title');
  const count=document.getElementById('result-count');
  const stats=document.getElementById('stats');

  if(localStorage.getItem('forensic-record-content-notice')==='accepted') gate.classList.add('hidden');
  enter.addEventListener('click',()=>{
    localStorage.setItem('forensic-record-content-notice','accepted');
    gate.classList.add('hidden');
    input.focus();
  });
  leave.addEventListener('click',()=>history.length>1?history.back():location.replace('about:blank'));

  const esc=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const link=(url)=>{
    try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}
  };
  const format=(n)=>Number(n||0).toLocaleString();

  function render(rows){
    results.innerHTML='';
    if(!rows.length){
      status.textContent='No matching findings.';
      status.classList.remove('hidden');
      return;
    }
    status.classList.add('hidden');
    for(const row of rows){
      const article=document.createElement('article');
      article.className='finding';
      const src=link(row.source_url);
      let html='';
      html+='<div class="finding-head"><div>';
      html+='<div class="finding-number">Finding #'+esc(row.finding_number??'—')+'</div>';
      html+='<h3>'+esc(row.title||'Untitled finding')+'</h3></div>';
      html+='<span class="truth">'+esc(row.truth_label||'Unlabeled')+'</span></div>';
      html+='<div class="finding-meta">';
      html+='<span>'+esc(row.source_document||'Source not labeled')+'</span>';
      html+='<span>'+esc(row.page_reference||'Page reference unavailable')+'</span>';
      html+='<span>'+esc(row.category||'Uncategorized')+'</span></div>';
      if(row.quote) html+='<div class="quote">'+esc(row.quote)+'</div>';
      if(row.significance) html+='<div class="significance">'+esc(row.significance)+'</div>';
      if(src) html+='<a class="source-link" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>';
      article.innerHTML=html;
      results.appendChild(article);
    }
  }

  async function loadStats(){
    try{
      const r=await fetch('/v1/stats');
      const s=await r.json();
      if(!r.ok) throw new Error(s.error||'stats unavailable');
      const cells=stats.querySelectorAll('strong');
      cells[0].textContent=format(s.finding_rows);
      cells[1].textContent=format(s.unique_finding_numbers);
      cells[2].textContent=format(s.canonical_source_documents);
      cells[3].textContent=format(s.missing_page_reference);
    }catch{
      stats.setAttribute('aria-label','Archive statistics temporarily unavailable');
    }
  }

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const q=input.value.trim();
    if(!q){input.focus();return}
    status.classList.remove('hidden');
    status.textContent='Searching the owned archive…';
    results.innerHTML='';
    count.textContent='';
    try{
      let r;
      if(/^[0-9]+$/.test(q)){
        r=await fetch('/v1/findings/'+encodeURIComponent(q));
      }else{
        if(q.length<2) throw new Error('Enter at least two characters.');
        r=await fetch('/v1/search',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({text:q,limit:50})
        });
      }
      const body=await r.json();
      if(!r.ok) throw new Error(body.error||'Search failed');
      const rows=body.results||[];
      title.textContent='Search results';
      count.textContent=rows.length+' result'+(rows.length===1?'':'s');
      render(rows);
    }catch(error){
      title.textContent='Search unavailable';
      status.textContent=error.message||'Search failed.';
    }
  });

  loadStats();
})();`;
}
