// Private static visual timeline from a verified local Saban aggregate journal.
// Never claims an independent signature, a live connection, or a full event history.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyPrivateSabanTransitionJournal} from './saban-transition-journal.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const LABELS={
  leased:'Work assigned',completed:'Work completed',
  retry_queued:'Work returned to queue',dead_letter:'Needs attention',
  scheduler_finished:'Scheduler finished'
};
const FLAGS={
  leased:'ASSIGNED',completed:'COMPLETED',
  retry_queued:'RETRY',dead_letter:'REVIEW',
  scheduler_finished:'FINISHED'
};
const STATES=['queued','leased','completed','dead_letter'];
const text=(raw)=>String(raw);
const noPublicDir=dir=>{
  const relative=path.relative(ROOT,dir);
  return relative!=='' && (relative==='..'||relative.startsWith('..'+path.sep));
};
export function renderVerifiedSabanTransitionView(raw){
  const check=verifyPrivateSabanTransitionJournal(raw);
  const rows=raw.trimEnd().split('\n').map(line=>JSON.parse(line));
  const source=rows[0].source_class;
  if(rows.some(e=>e.source_class!==source))throw new Error('Mixed journal source classes');

  // A compact decision surface, not 25 full-size repeated cards.
  // Every displayed number is derived from the latest verified local entry.
  const latest=rows.at(-1);
  const state=latest.counts;
  const outstanding=state.queued+state.leased+state.dead_letter;
  const mode=source==='synthetic_test'?'SYNTHETIC TEST / NOT LIVE':'PRIVATE LOCAL OBSERVATIONS';
  const guidance=state.dead_letter>0?
    state.dead_letter+' job'+(state.dead_letter===1?' needs':'s need')+
      ' review. Inspect the authorized Saban error records privately before releasing work.':
    state.queued>0?
      state.queued+' job'+(state.queued===1?' remains':'s remain')+
      ' queued in the last observation. Inspect the scheduler, not a simulated progress animation.':
    state.leased>0?
      state.leased+' job'+(state.leased===1?' was':'s were')+
      ' assigned in the last observation. Check lease freshness before assuming work is still running.':
    'No outstanding jobs in the final observation. Check actual output receipts before customer delivery.';
  const boxes=[
    ['completed','Completed',state.completed],
    ['dead_letter','Needs review',state.dead_letter],
    ['queued','Waiting',state.queued],
    ['leased','Assigned',state.leased]
  ].map(([kind,label,count])=>'<div class="metric '+kind+'"><span>'+label+
    '</span><strong>'+count.toLocaleString('en-US')+'</strong></div>').join('');
  const compact=rows.slice(-4).reverse().map(row=>
    '<li class="recent-event"><span class="recent-mark '+row.kind+'"></span>'+
      '<span class="recent-copy"><strong>'+LABELS[row.kind]+'</strong>'+
      '<small>Recorded observation '+row.seq+' · '+row.at.slice(11,19)+' UTC</small></span>'+
      '<span class="recent-count">'+row.counts.completed+' done</span></li>'
  ).join('');
  const history=rows.map(row=>
    '<li class="history-event"><b>#'+String(row.seq).padStart(2,'0')+'</b>'+
      '<span>'+LABELS[row.kind]+'</span><time>'+row.at.slice(11,19)+' UTC</time>'+
      '<small>Q '+row.counts.queued+' · A '+row.counts.leased+
      ' · C '+row.counts.completed+' · R '+row.counts.dead_letter+'</small></li>'
  ).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
    '<title>Evercraft Saban / Work Review</title><style>'+
    ':root{color-scheme:dark;--bg:#111014;--ink:#f9f6f8;--muted:#b9b0bc;--hair:#403541;--accent:#f77d97}'+
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}'+
    'main{max-width:1000px;margin:auto;padding:clamp(18px,4vw,50px)}.top{display:flex;justify-content:space-between;align-items:center;gap:13px;flex-wrap:wrap;border-bottom:1px solid var(--hair);padding-bottom:17px;font-size:15px;font-weight:850;letter-spacing:-.02em}'+
    '.brand em{font-style:normal;color:var(--accent)}.mode{font:700 10px/1.5 ui-monospace,monospace;color:#f3bac7;border:1px solid #81475b;border-radius:20px;padding:6px 10px}.hero{padding:30px 0 19px}'+
    '.eyebrow{font:750 11px ui-monospace,monospace;letter-spacing:.08em;color:#ef9aaf}.hero h1{font-size:clamp(37px,6vw,62px);line-height:1.06;letter-spacing:-.065em;margin:12px 0 13px}.hero h1 span{color:var(--accent)}'+
    '.hero p{margin:0;max-width:630px;color:var(--muted);font-size:13px}.hero .context{margin-top:12px;font:700 11px ui-monospace,monospace;color:#d5c7d0}'+
    '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric{min-width:0;background:linear-gradient(145deg,#252027,#1a181e);border:1px solid #4a3846;border-radius:14px;padding:17px 18px}.metric>span{display:block;font-size:12px;color:#c8c0c9}.metric strong{display:block;font:850 clamp(29px,5vw,49px) system-ui,sans-serif;letter-spacing:-.075em;font-variant-numeric:tabular-nums;margin-top:7px}.metric.completed{border-top:3px solid #8de3c8}.metric.dead_letter{border-top:3px solid #f27b95}.metric.queued{border-top:3px solid #9492a1}.metric.leased{border-top:3px solid #eabb88}'+
    '.action{margin:16px 0 25px;border:1px solid #7d495a;border-left:4px solid var(--accent);background:#291c24;border-radius:12px;padding:17px 19px}.action strong{font:800 12px ui-monospace,monospace;color:#f6aebf;letter-spacing:.07em}.action p{font-size:13px;line-height:1.55;margin:7px 0 0;color:#f1e4e9}'+
    '.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 11px}.section-head h2{font-size:19px;letter-spacing:-.04em;margin:0}.section-head span{color:var(--muted);font:600 11px ui-monospace,monospace}'+
    '.recent-list,.history-list{list-style:none;margin:0;padding:0}.recent-event{background:#1c191f;border:1px solid #3f3540;padding:12px 16px;border-radius:10px;display:flex;gap:12px;align-items:center;margin-bottom:7px}'+
    '.recent-mark{width:9px;height:9px;flex:none;background:#f3a1b3;border-radius:50%}.recent-mark.completed{background:#8de3c8}.recent-mark.leased{background:#eabb88}.recent-mark.dead_letter{background:#f27b95}'+
    '.recent-copy{flex:1;min-width:0}.recent-copy strong,.recent-copy small{display:block}.recent-copy strong{font-size:13px}.recent-copy small{color:var(--muted);font-size:11px;margin-top:2px}.recent-count{font:700 11px ui-monospace,monospace;color:#d8c2c9;white-space:nowrap}'+
    '.history{margin-top:23px;border:1px solid #53424f;background:#1c1920;border-radius:12px;overflow:hidden}.history summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:15px 17px;font-weight:750;font-size:13px}.history summary::-webkit-details-marker{display:none}.history summary span{color:#f6a7b9;font:750 11px ui-monospace,monospace}.history[open] summary{border-bottom:1px solid #483b47}.history-list{padding:10px 15px 16px;max-height:480px;overflow:auto}.history-event{display:grid;grid-template-columns:42px minmax(0,1fr) 88px;column-gap:12px;row-gap:2px;align-items:center;padding:9px 4px;border-bottom:1px solid #413640;font-size:12px}.history-event b{color:#e7a1b0;font:750 11px ui-monospace,monospace}.history-event time{font:11px ui-monospace,monospace;color:#cec4ce;text-align:right}.history-event small{grid-column:2/-1;color:#a99daa;font:10px ui-monospace,monospace}'+
    '.footer{margin-top:22px;border-top:1px solid #463945;padding-top:17px;color:#aaa0ac;font-size:11px;max-width:780px}.footnote{color:#cdbfc8}'+
    '@media(max-width:650px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:15px}.metric strong{font-size:38px}.hero{padding:27px 0 18px}.hero h1{font-size:41px}.recent-event{padding:11px 12px}.history-list{padding:8px 10px 13px}.mode{font-size:9px}}'+
    '</style></head><body><main><header class="top"><div class="brand">EVERCRAFT <em>/</em> SABAN</div><span class="mode">'+mode+'</span></header>'+
    '<section class="hero"><span class="eyebrow">GRAPHICS COMMAND · PRIVATE OPERATIONS REVIEW</span>'+
    '<h1>The work.<br><span>At a glance.</span></h1>'+
    '<p>Recorded scheduler observations, not a live control room. Start with the outcome, then open the evidence only when you need it.</p>'+
    '<div class="context">'+check.entries.toLocaleString('en-US')+' recorded transitions · Local hash chain checked</div></section>'+
    '<section class="metrics" aria-label="Latest recorded job counts">'+boxes+'</section>'+
    '<section class="action" aria-label="Next action"><strong>WHAT TO DO NEXT</strong><p>'+guidance+'</p></section>'+
    '<section aria-label="Recent scheduler observations"><div class="section-head"><h2>Recent activity</h2><span>Last '+Math.min(4,rows.length)+' of '+check.entries+'</span></div><ol class="recent-list">'+compact+'</ol></section>'+
    '<details class="history"><summary>Inspect all '+check.entries+' recorded transitions <span>EXPAND HISTORY +</span></summary><ol class="history-list">'+history+'</ol></details>'+
    '<footer class="footer"><strong class="footnote">Verification boundary:</strong> Local SHA-256 chain only. It does not prove who recorded the events or independently verify job completion. Intermediate events outside this capture may be missing. No customer information, agent identities or private work contents are included. Not for publication or customer delivery.</footer>'+
    '</main></body></html>';
}
export function createPrivateTransitionReview({directory}={}){
  if(typeof directory!=='string'||!path.isAbsolute(directory))
    throw new Error('Journal review directory must be absolute');
  const dir=path.resolve(directory);
  if(!noPublicDir(dir)||dir===path.parse(dir).root||fs.realpathSync(dir)!==dir)
    throw new Error('Journal directory must be private, canonical, and outside repo');
  const src=path.join(dir,'saban-transitions.jsonl');
  const stat=fs.lstatSync(src);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)
    throw new Error('Invalid local journal file');
  const fd=fs.openSync(src,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  let raw;
  try{
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.ino!==stat.ino||opened.dev!==stat.dev)
      throw new Error('Journal changed during read');
    raw=fs.readFileSync(fd,'utf8');
  }finally{fs.closeSync(fd);}
  const html=renderVerifiedSabanTransitionView(raw);
  const out=path.join(dir,'saban-transitions-review.html');
  fs.writeFileSync(out,html,{flag:'wx',mode:0o600});
  return {output:out,source_class:JSON.parse(raw.split('\n')[0]).source_class,
    local_chain_verified:true,independently_attested:false,
    publication_authority:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node saban-transition-view.mjs /absolute/private/journal-directory');
    process.stdout.write(JSON.stringify(createPrivateTransitionReview({directory:process.argv[2]}))+'\n');
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
