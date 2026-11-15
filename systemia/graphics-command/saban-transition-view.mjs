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
  const blocks=rows.map((row,i)=>{
    const bar=STATES.map(s=>'<span class="mini '+s+'" style="flex:'+row.counts[s]+' 0 0" title="'+s+' '+row.counts[s]+'"></span>').join('');
    const values=STATES.map(s=>'<div class="cell"><small>'+s.replace('_',' ')+'</small><strong>'+row.counts[s]+'</strong></div>').join('');
    return '<article class="event"><div class="rail"><span>'+String(row.seq).padStart(2,'0')+'</span><i></i></div>'+
      '<div class="event-body"><div class="event-head"><div><span class="flag '+row.kind+'">'+FLAGS[row.kind]+'</span><h2>'+LABELS[row.kind]+'</h2></div><time>'+row.at+'</time></div>'+
      '<div class="stack" role="img" aria-label="Queued '+row.counts.queued+', assigned '+row.counts.leased+
      ', completed '+row.counts.completed+', needs attention '+row.counts.dead_letter+'">'+bar+'</div>'+
      '<div class="values">'+values+'</div></div></article>';
  }).join('');
  const mode=source==='synthetic_test'?'SYNTHETIC TEST / NOT LIVE':'PRIVATE SCHEDULER OBSERVATIONS';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
    '<title>Evercraft Saban / Verified Local Transitions</title><style>'+
    ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#111014;color:#f9f6f8;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1080px;margin:auto;padding:clamp(19px,5vw,64px)}'+
    '.top{display:flex;align-items:center;justify-content:space-between;gap:13px;flex-wrap:wrap;padding-bottom:23px;border-bottom:1px solid #36313a;font-weight:850;letter-spacing:-.03em}.top em{font-style:normal;color:#f16b87}.mode{font:700 10px ui-monospace,monospace;color:#f5c1cd;border:1px solid #7c4154;border-radius:20px;padding:8px 12px}'+
    '.hero{padding:48px 0 32px}.hero small{color:#f48da2;font:750 12px ui-monospace,monospace;letter-spacing:.1em}.hero h1{font-size:clamp(42px,7vw,86px);line-height:1;letter-spacing:-.075em;margin:16px 0 20px}.hero h1 span{color:#f38ca6}.hero p{max-width:700px;color:#bfb5bf;font-size:14px}.summary{display:flex;gap:13px;flex-wrap:wrap;margin-top:25px}.summary div{background:#211920;padding:11px 15px;border:1px solid #4b3540;border-radius:10px;font-size:12px}.summary strong{color:#f9b1c1}'+
    '.event{display:grid;grid-template-columns:45px minmax(0,1fr);gap:14px;margin-bottom:17px}.rail{display:flex;flex-direction:column;align-items:center;gap:8px;font:750 12px ui-monospace,monospace;color:#f18ba5}.rail span{width:37px;height:37px;border:1px solid #9f4d60;border-radius:50%;display:grid;place-items:center}.rail i{width:1px;background:linear-gradient(#9f4d60,#34303b);flex:1}.event-body{background:linear-gradient(115deg,#211a22,#17151b);border:1px solid #453744;border-radius:17px;padding:25px}.event-head{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap}.event-head h2{font-size:24px;letter-spacing:-.05em;line-height:1.1;margin:9px 0 0}.event-head time{color:#bdb1bd;font:11px ui-monospace,monospace;overflow-wrap:anywhere}.flag{font:800 10px ui-monospace,monospace;letter-spacing:.1em;color:#f19aaf}.flag.completed{color:#8de4ca}.flag.leased{color:#fac894}.flag.dead_letter{color:#ff98ac}'+
    '.stack{display:flex;gap:3px;min-height:11px;background:#363039;border-radius:12px;overflow:hidden;margin:26px 0 18px}.mini{display:block;min-width:0}.mini.queued{background:#8b8798}.mini.leased{background:#f0b679}.mini.completed{background:#76cbb3}.mini.dead_letter{background:#f26d86}.values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.cell small{font:650 10px ui-monospace,monospace;color:#bdb1bd;text-transform:uppercase;display:block}.cell strong{font:800 22px ui-monospace,monospace;font-variant-numeric:tabular-nums}.footer{margin:28px 0 0;padding:24px 0;border-top:1px solid #443742;color:#b6aeb7;font-size:12px}'+
    '@media(max-width:560px){.event{grid-template-columns:30px minmax(0,1fr);gap:7px}.rail span{width:30px;height:30px;font-size:10px}.event-body{padding:17px 15px}.values{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:13px}.hero{padding-top:37px}.event-head h2{font-size:21px}}'+
    '</style></head><body><main><header class="top"><div>EVERCRAFT <em>/</em> SABAN</div><span class="mode">'+mode+'</span></header>'+
    '<section class="hero"><small>GRAPHICS COMMAND / OBSERVED TRANSITIONS</small><h1>The work.<br><span>In sequence.</span></h1>'+
    '<p>Recorded state changes emitted by the local Saban scheduler. Aggregate counts only, with a locally checkable hash chain. This is not independent attestation, a live dashboard, or a complete history of events before or outside this capture.</p>'+
    '<div class="summary"><div>OBSERVATIONS <strong>'+check.entries+'</strong></div>'+
    '<div>CHAIN <strong>LOCAL SHA-256</strong></div><div>PUBLICATION <strong>DISABLED</strong></div></div></section>'+
    blocks+'<footer class="footer">The hash chain detects some edits to this local file, but it does not prove who wrote the entries or verify real-world completion. Private source data and worker identifiers are excluded. Do not publish this report or interpret it as an independently authenticated audit.</footer></main></body></html>';
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
