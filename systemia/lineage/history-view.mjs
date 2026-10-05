import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function short(id) {
  return String(id || '').slice(0, 12);
}

async function changeSummary(store, commitId, commit) {
  const parent = commit.payload.parents?.[0] ?? null;
  if (!parent) {
    const tree = await store.getTree(commitId);
    return {
      added: tree.entries.length,
      modified: 0,
      deleted: 0,
      compared_to: null
    };
  }

  const diff = await store.diff(parent, commitId);
  return {
    added: diff.changes.filter((x) => x.status === 'added').length,
    modified: diff.changes.filter((x) => x.status === 'modified').length,
    deleted: diff.changes.filter((x) => x.status === 'deleted').length,
    compared_to: parent
  };
}

export async function buildHistoryGraph(store, {
  ref = 'HEAD',
  limit = 100
} = {}) {
  const head = await store.resolveRef(ref);
  if (!head) {
    return {
      schema: 'evercraft.lineage.history-graph.v1',
      ref,
      head: null,
      nodes: [],
      edges: [],
      truncated: false
    };
  }

  const queue = [head];
  const seen = new Set();
  const nodes = [];

  while (queue.length && nodes.length < limit) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const object = await store.readObject(id);
    if (object.type !== 'commit') continue;

    const summary = await changeSummary(store, id, object);
    nodes.push({
      id,
      short_id: short(id),
      tree_id: object.payload.tree_id,
      parents: object.payload.parents ?? [],
      message: object.payload.message ?? '',
      actor: object.payload.actor ?? { type: 'unknown', id: 'unknown' },
      created_at: object.payload.created_at ?? null,
      rationale: object.payload.rationale ?? null,
      provenance: object.payload.provenance ?? { sources: [], evidence: [], rights: [] },
      authority: object.payload.authority ?? { mutation: null, publish: null, payment: null },
      transaction_count: Array.isArray(object.payload.transactions) ? object.payload.transactions.length : 0,
      change_summary: summary
    });

    queue.push(...(object.payload.parents ?? []));
  }

  const loaded = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const node of nodes) {
    for (const parent of node.parents) {
      if (loaded.has(parent)) {
        edges.push({ from: parent, to: node.id, type: 'parent' });
      }
    }
  }

  return {
    schema: 'evercraft.lineage.history-graph.v1',
    ref,
    head,
    nodes,
    edges,
    truncated: queue.length > 0,
    authority_note: 'History visibility does not grant mutation, publication, deployment, payment, or private-data authority.'
  };
}

export function renderHistoryHtml(graph) {
  const data = JSON.stringify(graph).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Lineage</title>
<style>
:root{color-scheme:dark;--bg:#080b0b;--panel:#101515;--line:#293232;--text:#f5f5f2;--muted:#aab2b7;--ice:#4fb8ff;--gold:#b79a56}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:3;background:rgba(8,11,11,.94);backdrop-filter:blur(16px);border-bottom:1px solid var(--line);padding:18px 24px}
.brand{font-weight:900;letter-spacing:.08em;text-transform:uppercase}.brand b{color:var(--gold)}.sub{color:var(--muted);margin-top:4px}
.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px}input{min-width:280px;background:#0d1111;border:1px solid #344040;border-radius:10px;color:var(--text);padding:10px 12px}
.stat{border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:var(--muted)}
main{width:min(1120px,calc(100% - 32px));margin:28px auto 72px}.graph{display:grid;gap:14px}
.commit{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 20px 16px;box-shadow:0 18px 40px rgba(0,0,0,.15)}
.commit.head{border-color:var(--ice);box-shadow:0 0 0 1px rgba(79,184,255,.15),0 18px 40px rgba(0,0,0,.18)}
.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ice);font-weight:800}.message{font-size:1.1rem;font-weight:760;margin:6px 0}
.meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:.88rem}.badge{border:1px solid #334040;border-radius:999px;padding:3px 8px}.agent{color:var(--gold)}
.changes{display:flex;gap:12px;margin-top:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.add{color:#8bd49c}.mod{color:#f0c86c}.del{color:#e99191}
.parents,.authority{margin-top:12px;color:var(--muted);font-size:.86rem}.parents code{color:#c8d5db}.authority strong{color:var(--text)}
.empty{padding:80px 20px;text-align:center;color:var(--muted)}
footer{width:min(1120px,calc(100% - 32px));margin:0 auto 40px;color:var(--muted);font-size:.86rem}
</style>
</head>
<body>
<header>
  <div class="brand">Evercraft <b>Lineage</b></div>
  <div class="sub">Universal history for code, data, worlds, media, research, and agent action.</div>
  <div class="controls">
    <input id="q" type="search" placeholder="Filter commits, actors, hashes...">
    <span class="stat" id="count"></span>
    <span class="stat">ref: ${escapeHtml(graph.ref)}</span>
    <span class="stat">head: ${escapeHtml(short(graph.head))}</span>
  </div>
</header>
<main><div class="graph" id="graph"></div></main>
<footer>${escapeHtml(graph.authority_note || '')}</footer>
<script>
const GRAPH=${data};
const root=document.getElementById('graph');
const q=document.getElementById('q');
const count=document.getElementById('count');
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function render(){
  const term=q.value.trim().toLowerCase();
  const rows=GRAPH.nodes.filter(n=>!term||[n.id,n.message,n.actor?.type,n.actor?.id,n.rationale].join(' ').toLowerCase().includes(term));
  count.textContent=rows.length+' / '+GRAPH.nodes.length+' commits';
  if(!rows.length){root.innerHTML='<div class="empty">No matching history.</div>';return}
  root.innerHTML=rows.map(n=>{
    const a=n.authority||{};
    const c=n.change_summary||{};
    const parents=(n.parents||[]).map(p=>'<code>'+esc(p.slice(0,12))+'</code>').join(' · ')||'root';
    return '<article class="commit '+(n.id===GRAPH.head?'head':'')+'">'
      +'<div class="top"><div><div class="hash">'+esc(n.short_id)+'</div><div class="message">'+esc(n.message||'(no message)')+'</div></div>'
      +'<div class="meta"><span class="badge '+(n.actor?.type==='agent'?'agent':'')+'">'+esc(n.actor?.type)+': '+esc(n.actor?.id)+'</span>'
      +(n.created_at?'<span class="badge">'+esc(n.created_at)+'</span>':'')+'</div></div>'
      +'<div class="changes"><span class="add">+'+(c.added||0)+'</span><span class="mod">~'+(c.modified||0)+'</span><span class="del">-'+(c.deleted||0)+'</span></div>'
      +'<div class="parents">parents: '+parents+'</div>'
      +'<div class="authority"><strong>authority</strong> mutation='+esc(a.mutation)+' · publish='+esc(a.publish)+' · payment='+esc(a.payment)+' · transactions='+(n.transaction_count||0)+'</div>'
      +(n.rationale?'<div class="authority"><strong>why</strong> '+esc(n.rationale)+'</div>':'')
      +'</article>';
  }).join('');
}
q.addEventListener('input',render);render();
</script>
</body>
</html>`;
}

export async function writeHistoryBundle(store, {
  outDir,
  ref = 'HEAD',
  limit = 100
}) {
  if (!outDir) throw new Error('outDir is required');
  const dir = resolve(outDir);
  const graph = await buildHistoryGraph(store, { ref, limit });
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, 'graph.json'), JSON.stringify(graph, null, 2) + '\n', 'utf8'),
    writeFile(join(dir, 'index.html'), renderHistoryHtml(graph), 'utf8')
  ]);
  return {
    schema: 'evercraft.lineage.history-bundle.v1',
    out_dir: dir,
    ref,
    head: graph.head,
    commits: graph.nodes.length,
    edges: graph.edges.length,
    truncated: graph.truncated,
    outputs: ['graph.json', 'index.html']
  };
}
