import path from 'node:path';
import { createTowiResident } from './resident.mjs';
import { editorialPacketForDossier } from './core.mjs';

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function renderControlRoom() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOWI | Evercraft</title>
<style>
:root{color-scheme:dark;--bg:#070b0d;--panel:#10171b;--text:#eef4f5;--muted:#9fb0b8;--accent:#70d6ff;--watch:#ffd166}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 15% 0,#10222a 0,#070b0d 40%);color:var(--text);font-family:Inter,system-ui,sans-serif}
main{width:min(1180px,calc(100% - 32px));margin:auto;padding:54px 0 90px}
h1{font-size:clamp(3rem,9vw,7rem);margin:0;letter-spacing:-.07em;line-height:.88}
header p{color:var(--muted);font-size:1.1rem;max-width:760px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:30px 0}
.stat{background:var(--panel);border:1px solid #223139;border-radius:12px;padding:12px 16px}
.grid{display:grid;gap:16px}
.card{background:linear-gradient(180deg,#111a1f,#0c1215);border:1px solid #223139;border-radius:16px;padding:20px}
.meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:.86rem}
.type{font-weight:800;color:var(--accent)}
.WATCH .type{color:var(--watch)}
h2{margin:.45rem 0;font-size:1.35rem}
.score{font-variant-numeric:tabular-nums}
footer{color:var(--muted);margin-top:36px}
</style>
</head>
<body>
<main>
<header>
<div>TOWI</div>
<h1>THE WORLD,<br>OPENED UP.</h1>
<p>Evidence-controlled investigation of the physical systems behind the headline. Radar finds the change. TOWI opens the machine.</p>
</header>
<div id="stats" class="stats"></div>
<section id="grid" class="grid"><div class="card">Loading TOWI desk…</div></section>
<footer>Observed, reported, modeled, inferred, contested and pending are never silently collapsed into the same thing.</footer>
</main>
<script>
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,function(char){
    if(char==="&") return "&amp;";
    if(char==="<") return "&lt;";
    if(char===">") return "&gt;";
    if(char==='"') return "&quot;";
    return "&#39;";
  });
}
fetch("/api/towi/latest")
  .then(function(response){ return response.json(); })
  .then(function(data){
    document.getElementById("stats").innerHTML=[
      ["Dossiers",data.dossier_count||0],
      ["Editorial candidates",data.editorial_candidate_count||0],
      ["Watches",data.watch_count||0],
      ["Aftermath",data.aftermath_count||0]
    ].map(function(item){
      return "<div class=stat><strong>"+item[1]+"</strong> "+item[0]+"</div>";
    }).join("");
    const rows=data.dossiers||[];
    document.getElementById("grid").innerHTML=rows.length
      ? rows.map(function(row){
          return "<article class=\"card "+escapeHtml(row.story_type||"REPORT")+"\"><div class=meta><span class=type>"+
            escapeHtml(row.story_type||"REPORT")+"</span><span>"+escapeHtml(row.status||"unknown")+
            "</span><span class=score>score "+Number(row.score||0).toFixed(3)+"</span><span>"+
            escapeHtml(row.truth_state||"UNKNOWN")+"</span></div><h2>"+
            escapeHtml(row.title_seed||row.summary||"Untitled investigation")+
            "</h2><div class=meta><span>"+escapeHtml((row.domains||[]).join(" · "))+
            "</span><span>"+escapeHtml((row.region_keys||[]).join(" · "))+"</span></div></article>";
        }).join("")
      : "<div class=card>No material dossiers yet. Quiet is a valid state.</div>";
  })
  .catch(function(){
    document.getElementById("grid").innerHTML="<div class=card>TOWI desk is temporarily unavailable.</div>";
  });
</script>
</body>
</html>`;
}

export function registerTowiRoutes(app, {
  radarResident,
  isProd = process.env.NODE_ENV === 'production',
  stateDir = process.env.TOWI_STATE_DIR || path.resolve('.runtime', 'towi'),
  intervalMs = Number(process.env.TOWI_INTERVAL_MS || 5 * 60 * 1000),
  maxItems = Number(process.env.TOWI_MAX_ITEMS || 24)
} = {}) {
  const token = String(process.env.TOWI_INTERNAL_TOKEN || '').trim();
  const resident = createTowiResident({ radarResident, stateDir, intervalMs, maxItems });

  function requireInternal(req, res, next) {
    if (!token) {
      res.status(503).json({ ok: false, error: 'TOWI internal authority is not configured.' });
      return;
    }
    if (bearer(req) !== token) {
      res.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }
    next();
  }

  app.get('/towi', (_req, res) => {
    res.redirect(301, '/towi/');
  });

  app.get('/towi/', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.type('html').send(renderControlRoom());
  });

  app.get('/api/towi/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(resident.health());
  });

  app.get('/api/towi/latest', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.json(resident.latest());
  });

  app.get('/api/towi/dossiers/:id', (req, res) => {
    const dossier = resident.dossier(String(req.params.id || ''));
    if (!dossier) {
      res.status(404).json({ ok: false, error: 'TOWI dossier not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.json({
      schema: 'evercraft.towi.public-dossier.v1',
      dossier_id: dossier.dossier_id,
      story_type: dossier.story_type,
      status: dossier.status,
      title_seed: dossier.title_seed,
      summary: dossier.summary,
      score: dossier.score,
      domains: dossier.domains,
      region_keys: dossier.region_keys,
      truth_state: dossier.truth_state,
      change_state: dossier.change_state,
      research_questions: dossier.research_questions,
      readiness: dossier.readiness,
      updated_at: dossier.updated_at,
      publication_authority: false
    });
  });

  app.get('/api/towi/internal/production', requireInternal, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(resident.productionQueue());
  });

  app.get('/api/towi/internal/dossiers/:id', requireInternal, (req, res) => {
    const dossier = resident.dossier(String(req.params.id || ''));
    if (!dossier) {
      res.status(404).json({ ok: false, error: 'TOWI dossier not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(editorialPacketForDossier(dossier));
  });

  app.post('/api/towi/internal/dossiers/:id/evidence', requireInternal, (req, res) => {
    try {
      const receipt = resident.addEvidence(String(req.params.id || ''), req.body?.evidence || req.body);
      res.status(receipt.status === 'deduped' ? 200 : 201).json(receipt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message === 'TOWI dossier not found' ? 404 : 400).json({
        ok: false,
        error: message
      });
    }
  });

  app.post('/api/towi/run', requireInternal, async (req, res) => {
    const receipt = await resident.runOnce({
      radarEdition: req.body?.radar_edition || null
    });
    res.status(receipt.status === 'failed' ? 503 : 200).json(receipt);
  });

  const autoStart = process.env.TOWI_RESIDENT_ENABLED == null
    ? isProd
    : String(process.env.TOWI_RESIDENT_ENABLED).toLowerCase() === 'true';

  if (autoStart) resident.start();

  return resident;
}
