import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { buildHistoryGraph } from './history-view.mjs';
import { semanticDiff } from './semantic-diff.mjs';
import { planGarbageCollection } from './gc.mjs';

function normalizePath(value) {
  return String(value).split(sep).join('/');
}

async function walkFiles(root) {
  const out = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  await walk(root);
  return out.sort();
}

function clampLimit(value, fallback = 120) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function sendJson(res, status, body) {
  const encoded = Buffer.from(JSON.stringify(body, null, 2) + '\n');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': encoded.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(encoded);
}

function sendHtml(res, html) {
  const encoded = Buffer.from(html);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': encoded.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });
  res.end(encoded);
}

function safeError(error) {
  return {
    error: error?.code || 'lineage_control_room_error',
    message: String(error?.message || error),
  };
}

export async function listLineageBranches(store) {
  const root = join(store.dir, 'refs', 'heads');
  const branches = [];
  for (const file of await walkFiles(root)) {
    const name = normalizePath(relative(root, file));
    const head = (await readFile(file, 'utf8')).trim() || null;
    branches.push({
      name,
      head,
      short_head: head ? head.slice(0, 12) : null,
    });
  }
  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLineageReleases(store) {
  const root = join(store.dir, 'releases');
  const releases = [];
  for (const file of await walkFiles(root)) {
    const rel = normalizePath(relative(root, file));
    const [channel, ...nameParts] = rel.split('/');
    const name = nameParts.join('/');
    if (!channel || !name) continue;

    const releaseId = (await readFile(file, 'utf8')).trim();
    if (!releaseId) continue;

    try {
      const object = await store.readObject(releaseId);
      if (object.type !== 'release') continue;
      releases.push({
        release_id: releaseId,
        short_release_id: releaseId.slice(0, 12),
        channel,
        name,
        state: object.payload.state || null,
        commit_id: object.payload.commit_id || null,
        short_commit_id: object.payload.commit_id
          ? String(object.payload.commit_id).slice(0, 12)
          : null,
        created_at: object.payload.created_at || null,
        actor: object.payload.actor || null,
        artifacts: Array.isArray(object.payload.artifacts)
          ? object.payload.artifacts.map((artifact) => ({
              name: artifact.name,
              sha256: artifact.sha256,
              bytes: artifact.bytes ?? null,
              media_type: artifact.media_type ?? null,
            }))
          : [],
        authority_receipt_count: Array.isArray(
          object.payload.authority_receipt_refs
        )
          ? object.payload.authority_receipt_refs.length
          : 0,
      });
    } catch (error) {
      releases.push({
        release_id: releaseId,
        short_release_id: releaseId.slice(0, 12),
        channel,
        name,
        state: 'unreadable',
        error: String(error?.message || error),
      });
    }
  }
  return releases.sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

async function storageSnapshot(store) {
  try {
    const plan = await planGarbageCollection(store, {
      graceMs: 24 * 60 * 60 * 1000,
    });
    return {
      state: 'available',
      grace_hours: 24,
      inventory: plan.inventory,
      reachable: plan.reachable,
      reclaimable: plan.reclaimable,
      candidate_counts: {
        objects: plan.candidates.objects.length,
        manifests: plan.candidates.manifests.length,
        chunks: plan.candidates.chunks.length,
      },
      destructive: false,
      plan_id: plan.plan_id,
    };
  } catch (error) {
    return {
      state: 'unavailable',
      destructive: false,
      ...safeError(error),
    };
  }
}

export async function inspectLineageCommit(store, id) {
  const commitId = await store.resolveRef(id);
  if (!commitId) {
    const error = new Error(`Unknown commit or ref: ${id}`);
    error.code = 'LINEAGE_CONTROL_ROOM_UNKNOWN_COMMIT';
    throw error;
  }
  const commit = await store.readObject(commitId);
  if (commit.type !== 'commit') {
    const error = new Error(`Object is not a commit: ${commitId}`);
    error.code = 'LINEAGE_CONTROL_ROOM_NOT_COMMIT';
    throw error;
  }
  const tree = await store.getTree(commitId);
  return {
    schema: 'evercraft.lineage.control-room.commit.v1',
    id: commitId,
    short_id: commitId.slice(0, 12),
    message: commit.payload.message || '',
    actor: commit.payload.actor || { type: 'unknown', id: 'unknown' },
    created_at: commit.payload.created_at || null,
    rationale: commit.payload.rationale || null,
    parents: commit.payload.parents || [],
    tree_id: commit.payload.tree_id,
    provenance: commit.payload.provenance || {
      sources: [],
      evidence: [],
      rights: [],
    },
    authority: commit.payload.authority || {
      mutation: null,
      publish: null,
      payment: null,
    },
    transactions: commit.payload.transactions || [],
    metadata: commit.payload.metadata || {},
    entries: tree.entries.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      bytes: entry.bytes,
      storage: entry.storage || 'blob',
      manifest_id: entry.manifest_id || null,
      content_sha256: entry.content_sha256 || null,
      sensitive_path_override: entry.sensitive_path_override || null,
    })),
    snapshot_policy: tree.snapshot_policy || null,
  };
}

export async function buildLineageControlRoomSnapshot(store, {
  ref = 'HEAD',
  limit = 120,
} = {}) {
  await store.ensureInitialized();
  const currentBranch = await store.currentBranch();
  const boundedLimit = clampLimit(limit);
  const [branches, releases, graph, storage] = await Promise.all([
    listLineageBranches(store),
    listLineageReleases(store),
    buildHistoryGraph(store, { ref, limit: boundedLimit }),
    storageSnapshot(store),
  ]);

  return {
    schema: 'evercraft.lineage.control-room.snapshot.v1',
    mode: 'read_only',
    generated_at: new Date().toISOString(),
    ref,
    current_branch: currentBranch,
    head: graph.head,
    branches,
    releases,
    graph,
    storage,
    capabilities: {
      history_graph: true,
      semantic_diff: true,
      commit_inspection: true,
      release_visibility: true,
      storage_visibility: true,
      mutation: false,
      publication: false,
      deployment: false,
      payment: false,
      private_data_authority: false,
    },
    authority_note:
      'Control Room is observational. Visibility does not grant mutation, publication, deployment, payment, release, or private-data authority.',
  };
}

export function renderLineageControlRoomHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Lineage Control Room</title>
<style>
:root{
  color-scheme:dark;
  --bg:#07100f;--panel:#0d1716;--panel2:#101e1c;--line:#243532;
  --text:#f1f7f5;--muted:#92a6a1;--green:#74e6ad;--blue:#63c7ff;
  --gold:#d0ad61;--red:#ff8b91;--violet:#c2a6ff;
}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,select,input{font:inherit;color:inherit}
header{position:sticky;top:0;z-index:20;padding:15px 20px;border-bottom:1px solid var(--line);background:rgba(7,16,15,.94);backdrop-filter:blur(16px)}
.brandrow{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.brand{font-weight:900;letter-spacing:.09em;text-transform:uppercase}.brand b{color:var(--gold)}.strap{color:var(--muted);font-size:.87rem;margin-top:3px}
.readonly{border:1px solid rgba(116,230,173,.35);color:var(--green);border-radius:999px;padding:5px 9px;font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace}
.toolbar{display:grid;grid-template-columns:minmax(180px,260px) minmax(220px,1fr) auto;gap:10px;margin-top:13px}
select,input{width:100%;background:#0a1312;border:1px solid #304440;border-radius:10px;padding:10px 12px;outline:none}input:focus,select:focus{border-color:var(--blue)}
.stats{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.pill{border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--muted);white-space:nowrap}
.shell{display:grid;grid-template-columns:220px minmax(0,1fr) 330px;min-height:calc(100vh - 112px)}
aside,.detail{padding:18px;border-right:1px solid var(--line)}.detail{border-right:0;border-left:1px solid var(--line)}
main{padding:18px;min-width:0}.section-title{font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.11em;margin:2px 0 10px}
.branch,.release,.commit,.storage{border:1px solid var(--line);background:var(--panel);border-radius:13px}
.branch,.release{padding:10px 11px;margin-bottom:8px;cursor:pointer}.branch:hover,.release:hover,.commit:hover{border-color:#3d5a55}
.branch.active{border-color:var(--blue)}.name{font-weight:750}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.tiny{color:var(--muted);font-size:11px;margin-top:3px}
.commit{padding:15px 16px;margin-bottom:10px;cursor:pointer}.commit.head{border-color:var(--blue);box-shadow:0 0 0 1px rgba(99,199,255,.09)}.ctop{display:flex;justify-content:space-between;gap:12px}.hash{color:var(--blue);font-weight:800}.message{font-weight:780;font-size:1.04rem;margin-top:4px}.badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.badge{border:1px solid #314540;border-radius:999px;padding:3px 7px;color:var(--muted);font-size:11px}.badge.agent{color:var(--gold)}.changes{margin-top:9px;display:flex;gap:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.add{color:var(--green)}.mod{color:#ffd071}.del{color:var(--red)}
.detailbox{border:1px solid var(--line);background:var(--panel2);border-radius:13px;padding:13px;margin-bottom:12px}.detailbox h3{margin:0 0 8px;font-size:.95rem}.kv{display:grid;grid-template-columns:92px 1fr;gap:5px 10px;font-size:12px}.kv div:nth-child(odd){color:var(--muted)}.path{padding:7px 0;border-bottom:1px solid rgba(36,53,50,.7);word-break:break-all}.path:last-child{border-bottom:0}
.storage{padding:12px}.meter{height:7px;border-radius:999px;background:#162522;overflow:hidden;margin-top:8px}.meter span{display:block;height:100%;background:linear-gradient(90deg,var(--green),var(--blue))}
.empty{color:var(--muted);padding:28px 10px;text-align:center}.error{color:var(--red)}.authority{color:var(--muted);font-size:11px;margin-top:12px}
@media(max-width:980px){.shell{grid-template-columns:190px minmax(0,1fr)}.detail{grid-column:1/-1;border-left:0;border-top:1px solid var(--line)}}
@media(max-width:680px){.toolbar{grid-template-columns:1fr}.shell{display:block}aside,.detail{border:0;border-bottom:1px solid var(--line)}header{position:relative}.branchrow{display:grid;grid-template-columns:1fr 1fr;gap:8px}.branch{margin:0}.ctop{display:block}.badges{justify-content:flex-start;margin-top:8px}}
</style>
</head>
<body>
<header>
  <div class="brandrow">
    <div><div class="brand">Evercraft <b>Lineage</b> Control Room</div><div class="strap">History of code, worlds, media, data, research, and agent action.</div></div>
    <div class="readonly">READ ONLY</div>
  </div>
  <div class="toolbar">
    <select id="branch"></select>
    <input id="search" type="search" placeholder="Search commits, actors, hashes, rationale">
    <div class="stats"><span class="pill" id="commitStat">0 commits</span><span class="pill" id="releaseStat">0 releases</span></div>
  </div>
</header>
<div class="shell">
  <aside>
    <div class="section-title">Branches</div>
    <div id="branches" class="branchrow"></div>
    <div class="section-title" style="margin-top:20px">Releases</div>
    <div id="releases"></div>
  </aside>
  <main>
    <div class="section-title">History</div>
    <div id="history"><div class="empty">Loading Lineage...</div></div>
  </main>
  <section class="detail">
    <div class="section-title">Inspector</div>
    <div id="inspector"><div class="empty">Select a commit.</div></div>
    <div class="section-title" style="margin-top:20px">Storage</div>
    <div id="storage"></div>
    <div class="authority">Visibility never widens execution authority.</div>
  </section>
</div>
<script>
const state={snapshot:null,selected:null};
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const short=v=>String(v||'').slice(0,12);
async function api(path){const r=await fetch(path,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||'request failed');return j}
function renderBranches(){
  const s=state.snapshot; const box=el('branches'); const select=el('branch');
  box.innerHTML=s.branches.map(b=>'<div class="branch '+(b.name===s.current_branch?'active':'')+'" data-ref="'+esc(b.name)+'"><div class="name">'+esc(b.name)+'</div><div class="tiny mono">'+esc(b.short_head||'empty')+'</div></div>').join('')||'<div class="empty">No branches.</div>';
  select.innerHTML=s.branches.map(b=>'<option value="'+esc(b.name)+'" '+(b.name===s.ref||('HEAD'===s.ref&&b.name===s.current_branch)?'selected':'')+'>'+esc(b.name)+'</option>').join('');
  box.querySelectorAll('[data-ref]').forEach(node=>node.onclick=()=>loadSnapshot(node.dataset.ref));
  select.onchange=()=>loadSnapshot(select.value);
}
function renderReleases(){
  const rows=state.snapshot.releases||[];el('releaseStat').textContent=rows.length+' releases';
  el('releases').innerHTML=rows.slice(0,20).map(r=>'<div class="release"><div class="name">'+esc(r.name)+'</div><div class="tiny">'+esc(r.channel)+' · '+esc(r.state||'unknown')+'</div><div class="tiny mono">'+esc(r.short_commit_id||r.short_release_id)+'</div></div>').join('')||'<div class="empty">No named releases.</div>';
}
function filteredNodes(){
  const q=el('search').value.trim().toLowerCase(); const nodes=state.snapshot?.graph?.nodes||[];
  return nodes.filter(n=>!q||[n.id,n.message,n.actor?.type,n.actor?.id,n.rationale].join(' ').toLowerCase().includes(q));
}
function renderHistory(){
  const nodes=filteredNodes();el('commitStat').textContent=nodes.length+' commits';
  el('history').innerHTML=nodes.map(n=>{
    const c=n.change_summary||{}; const actor=n.actor||{};
    return '<article class="commit '+(n.id===state.snapshot.head?'head':'')+'" data-id="'+esc(n.id)+'"><div class="ctop"><div><div class="hash mono">'+esc(n.short_id)+'</div><div class="message">'+esc(n.message||'(no message)')+'</div></div><div class="badges"><span class="badge '+(actor.type==='agent'?'agent':'')+'">'+esc(actor.type)+': '+esc(actor.id)+'</span>'+(n.created_at?'<span class="badge">'+esc(n.created_at)+'</span>':'')+'</div></div><div class="changes"><span class="add">+'+(c.added||0)+'</span><span class="mod">~'+(c.modified||0)+'</span><span class="del">-'+(c.deleted||0)+'</span></div></article>';
  }).join('')||'<div class="empty">No matching commits.</div>';
  el('history').querySelectorAll('[data-id]').forEach(node=>node.onclick=()=>inspect(node.dataset.id));
}
function renderStorage(){
  const s=state.snapshot.storage||{}; if(s.state!=='available'){el('storage').innerHTML='<div class="storage error">'+esc(s.message||'Storage plan unavailable')+'</div>';return}
  const inv=s.inventory||{}, rec=s.reclaimable||{}; const total=(inv.objects?.bytes||0)+(inv.manifests?.bytes||0)+(inv.chunks?.bytes||0);const reclaim=rec.total_bytes||0;const pct=total?Math.min(100,Math.round(reclaim/total*100)):0;
  el('storage').innerHTML='<div class="storage"><div class="name">'+Number(total).toLocaleString()+' bytes tracked</div><div class="tiny">'+Number(reclaim).toLocaleString()+' bytes eligible after 24h grace</div><div class="meter"><span style="width:'+pct+'%"></span></div><div class="tiny" style="margin-top:8px">objects '+(inv.objects?.count||0)+' · manifests '+(inv.manifests?.count||0)+' · chunks '+(inv.chunks?.count||0)+'</div></div>';
}
async function inspect(id){
  state.selected=id; const box=el('inspector');box.innerHTML='<div class="empty">Loading commit...</div>';
  try{
    const commit=await api('/v1/commit?id='+encodeURIComponent(id));
    let diff=null;if(commit.parents?.[0]){try{diff=await api('/v1/diff?from='+encodeURIComponent(commit.parents[0])+'&to='+encodeURIComponent(id))}catch{}}
    const a=commit.authority||{};const paths=(diff?.changes||[]).slice(0,40).map(x=>'<div class="path"><b>'+esc(x.status)+'</b> · '+esc(x.path)+(x.semantic?.reason?'<div class="tiny">'+esc(x.semantic.reason)+'</div>':'')+'</div>').join('');
    box.innerHTML='<div class="detailbox"><h3>'+esc(commit.message||'(no message)')+'</h3><div class="kv"><div>Commit</div><div class="mono">'+esc(commit.short_id)+'</div><div>Actor</div><div>'+esc(commit.actor?.type)+': '+esc(commit.actor?.id)+'</div><div>Authority</div><div>mutate '+esc(a.mutation)+' · publish '+esc(a.publish)+' · pay '+esc(a.payment)+'</div><div>Parents</div><div class="mono">'+esc((commit.parents||[]).map(short).join(', ')||'root')+'</div><div>Files</div><div>'+commit.entries.length+'</div></div>'+(commit.rationale?'<div class="tiny" style="margin-top:10px">why: '+esc(commit.rationale)+'</div>':'')+'</div>'+(paths?'<div class="detailbox"><h3>Changes</h3>'+paths+'</div>':'');
  }catch(error){box.innerHTML='<div class="detailbox error">'+esc(error.message)+'</div>'}
}
async function loadSnapshot(ref='HEAD'){
  el('history').innerHTML='<div class="empty">Loading Lineage...</div>';
  try{
    state.snapshot=await api('/v1/snapshot?ref='+encodeURIComponent(ref)+'&limit=160');
    renderBranches();renderReleases();renderHistory();renderStorage();
    if(state.snapshot.head) inspect(state.snapshot.head);
  }catch(error){el('history').innerHTML='<div class="empty error">'+esc(error.message)+'</div>'}
}
el('search').addEventListener('input',renderHistory);
loadSnapshot();
</script>
</body>
</html>`;
}

export async function startLineageControlRoom({
  store,
  host = '127.0.0.1',
  port = 0,
} = {}) {
  if (!store) throw new Error('Lineage store is required');
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(host))) {
    const error = new Error('Lineage Control Room must bind to loopback');
    error.code = 'LINEAGE_CONTROL_ROOM_LOOPBACK_REQUIRED';
    throw error;
  }

  const html = renderLineageControlRoomHtml();
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://lineage.local');

      if (req.method !== 'GET') {
        return sendJson(res, 405, {
          error: 'lineage_control_room_read_only',
          message: 'Control Room exposes read-only GET surfaces only.',
        });
      }

      if (requestUrl.pathname === '/') {
        return sendHtml(res, html);
      }

      if (requestUrl.pathname === '/health') {
        return sendJson(res, 200, {
          schema: 'evercraft.lineage.control-room.health.v1',
          ok: true,
          mode: 'read_only',
          mutation_authority: false,
          publication_authority: false,
          deployment_authority: false,
          payment_authority: false,
          private_data_authority: false,
        });
      }

      if (requestUrl.pathname === '/v1/snapshot') {
        const ref = requestUrl.searchParams.get('ref') || 'HEAD';
        const limit = clampLimit(requestUrl.searchParams.get('limit'));
        return sendJson(
          res,
          200,
          await buildLineageControlRoomSnapshot(store, { ref, limit })
        );
      }

      if (requestUrl.pathname === '/v1/commit') {
        const id = requestUrl.searchParams.get('id');
        if (!id) {
          return sendJson(res, 422, {
            error: 'lineage_control_room_commit_required',
          });
        }
        return sendJson(res, 200, await inspectLineageCommit(store, id));
      }

      if (requestUrl.pathname === '/v1/diff') {
        const from = requestUrl.searchParams.get('from');
        const to = requestUrl.searchParams.get('to');
        if (!from || !to) {
          return sendJson(res, 422, {
            error: 'lineage_control_room_diff_refs_required',
          });
        }
        return sendJson(res, 200, await semanticDiff(store, from, to));
      }

      return sendJson(res, 404, {
        error: 'lineage_control_room_route_not_found',
      });
    } catch (error) {
      return sendJson(res, 422, safeError(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const boundHost =
    typeof address === 'object' && address
      ? address.address === '::1'
        ? '[::1]'
        : address.address
      : host;
  const boundPort =
    typeof address === 'object' && address ? address.port : port;

  return {
    schema: 'evercraft.lineage.control-room.runtime.v1',
    mode: 'read_only',
    service_url: `http://${boundHost}:${boundPort}`,
    mutation_authority: false,
    publication_authority: false,
    deployment_authority: false,
    payment_authority: false,
    private_data_authority: false,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
