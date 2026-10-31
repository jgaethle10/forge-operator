#!/usr/bin/env node
// Source-backed offline Evercraft brand review; never publishes anything.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../..');
const DEFAULT_IDENTITY='docs/brand/identity-source-register.v1.json';
const DEFAULT_WORKSTREAMS='docs/brand/review-workstreams.v1.json';
const BLOCKED=/(?:^|[\s_/\-])(rivet|aliev|ali[\s-]?ev|skyops|sky[\s-]?ops)(?:$|[\s_/\-])/i;
const SAFE_KINDS=new Set(['parent','platform','product','creative','platform-family','service','family','infrastructure','engineering','utility']);
const SAFE_PRIORITY=new Set(['now','soon','later']);
const VERIFIED_MARK='verified_existing_mark';

export function assertRoster(workstreams,identity){
  if(workstreams?.schema!=='evercraft.brand-workstreams.v1'||!Array.isArray(workstreams.workstreams))throw Error('Invalid workstream schema');
  if(identity?.schema!=='evercraft.brand-identity.v1'||!Array.isArray(identity.brands))throw Error('Invalid identity schema');
  if(workstreams.publication_approved!==false||workstreams.review_only!==true)throw Error('Review roster must not authorize publication');
  if(identity.publishing?.auto_publish!==false||identity.publishing?.default_included!==false)throw Error('Identity register must default to private');
  const keys=new Set();
  for(const row of workstreams.workstreams){
    if(!row?.key||!row?.name||!row?.description||!row?.kind)throw Error('Incomplete workstream');
    if(BLOCKED.test(row.key)||BLOCKED.test(row.name))throw Error('Restricted project in marketing candidate roster: '+row.key);
    if(keys.has(row.key))throw Error('Duplicate workstream key: '+row.key);
    keys.add(row.key);
    if(!SAFE_KINDS.has(row.kind)||!SAFE_PRIORITY.has(row.priority))throw Error('Invalid workstream kind or priority: '+row.key);
    if(row.approval!=='unreviewed'||row.release_stage!=='not_attested')throw Error('Review manifest must remain explicitly unapproved: '+row.key);
  }
  const seen=new Set(), assets=new Set();
  for(const brand of identity.brands){
    if(seen.has(brand.key))throw Error('Duplicate identity: '+brand.key);
    seen.add(brand.key);
    if(brand.publication_approved!==false)throw Error('Identity is unexpectedly marked publishable: '+brand.key);
    const a=brand.asset||{};
    if(a.status===VERIFIED_MARK){
      if(typeof a.source!=='string'||!/^public\/[a-z0-9_/.-]+\.svg$/.test(a.source)||a.source.includes('..'))throw Error('Untrusted logo source: '+brand.key);
      if(assets.has(a.source))throw Error('A logo has been assigned to multiple products: '+a.source);
      assets.add(a.source);
    } else if(a.source!==null)throw Error('Unverified brand has logo source: '+brand.key);
  }
  return true;
}
export function assertPublicReleaseDenied(mode,workstreams,identity){
  if(mode==='public')throw Error('Public compilation is disabled until an independently approved release manifest and rights gate exist');
  if(mode!=='review')throw Error('Unsupported mode: '+mode);
  assertRoster(workstreams,identity);
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;':'&quot;',"'":'&#39;'}[ch]));
}
function encodeSvg(s){return 'data:image/svg+xml;base64,'+Buffer.from(s).toString('base64');}
function checkedAsset(brand,root){
  if(brand?.asset?.status!==VERIFIED_MARK)return null;
  const file=path.resolve(root,brand.asset.source);
  if(!file.startsWith(path.resolve(root,'public')+path.sep))throw Error('Logo outside owned public files');
  if(!fs.existsSync(file))throw Error('Verified logo missing: '+brand.asset.source);
  const svg=fs.readFileSync(file,'utf8');
  if(!/<svg[\s>]/i.test(svg)||/<script[\s>]/i.test(svg)||/(?:href|src)=["']https?:/i.test(svg))throw Error('Unsafe logo SVG: '+brand.asset.source);
  return encodeSvg(svg);
}
function card(row,identityMap,root){
  const b=identityMap.get(row.key);
  const art=checkedAsset(b,root);
  const icon=art?'<img src="'+art+'" alt="" width="49" height="49">':'<span class="parentmark">E</span>';
  const custody=art?'VERIFIED ORIGINAL MARK':'EVERCRAFT TEXT FALLBACK';
  return '<article class="card"><div class="row"><div class="mark">'+icon+'</div><div class="body"><div class="sub">'+escapeHtml(row.kind)+'</div><h2>'+escapeHtml(row.name)+'</h2><p>'+escapeHtml(row.description)+'</p></div></div><div class="bottom"><span>'+custody+'</span><span>'+escapeHtml(row.priority.toUpperCase())+' · REVIEW ONLY</span></div></article>';
}
export function compileReview(workstreams,identity,root=ROOT){
  assertRoster(workstreams,identity);
  const ids=new Map(identity.brands.map(b=>[b.key,b]));
  const rows=workstreams.workstreams;
  const css=String.raw`
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top right,#143954,#05101e 65%);color:#f2f9fc;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}header,main,footer{max-width:1160px;margin:auto;padding:30px 22px}header{border-bottom:1px solid #25495c}.eye{color:#78d8ee;letter-spacing:.18em;text-transform:uppercase;font-size:11px;font-weight:800}h1{font-size:clamp(28px,5vw,53px);letter-spacing:-.04em;line-height:1.1;margin:12px 0}header p{max-width:750px;color:#b3c9d7}.truth{background:#102b40;border-left:3px solid #72d8ec;border-radius:0 8px 8px 0;padding:14px;color:#cbe4f0;margin:20px 0}.stats{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}.stats span{border:1px solid #335a6e;border-radius:20px;padding:6px 12px;color:#d5ecf6;font-size:12px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.card{background:#0e2538;border:1px solid #315367;border-radius:15px;padding:20px;min-height:185px}.row{display:flex;gap:15px;align-items:flex-start}.mark{width:57px;height:57px;display:grid;place-items:center;border:1px solid #345a70;background:#0a1a2b;border-radius:11px;flex:none}.mark img{width:49px;height:49px;object-fit:contain}.parentmark{font-size:29px;letter-spacing:-.16em;font-weight:900;color:#a2d9ed;padding-right:5px}.body h2{margin:0;font-size:19px}.body p{color:#a9c2d1;margin:6px 0 12px}.sub{color:#79d4e9;text-transform:uppercase;font-size:10px;letter-spacing:.12em}.bottom{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;border-top:1px solid #315067;padding-top:12px;margin-top:20px;color:#8dd4e7;font-size:10px;letter-spacing:.07em}footer{font-size:12px;color:#9cb6c5}a{color:#83ddef}@media(max-width:680px){.cards{grid-template-columns:1fr}.card{min-height:0}}`;
  const body=rows.map(row=>card(row,ids,root)).join('\n');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft | Brand Review</title><style>'+css+'</style></head><body><header><div class="eye">EVERCRAFT / INTERNAL BRAND REVIEW</div><h1>Built. Building.<br>Being organized.</h1><p>One portfolio, multiple product families. Confirm each unique logo, ownership, current development state, and customer-facing availability before publication.</p><div class="stats"><span>'+rows.length+' review workstreams</span><span>'+identity.brands.filter(b=>b.asset.status===VERIFIED_MARK).length+' verified product marks</span><span>0 approved for auto-publication</span></div><div class="truth">INTERNAL REVIEW ONLY. The E letter is a neutral text placeholder, not a claimed approved standalone logo. No RIVET, AliEV, or SkyOps promotional entries. These are development and brand workstreams, not a count of ready-to-buy products.</div></header><main><section class="cards">'+body+'</section></main><footer>Evercraft · Local, source-derived review artifact · No public release approval granted</footer></body></html>';
}
export function loadSource(root=ROOT){
  const identity=JSON.parse(fs.readFileSync(path.join(root,DEFAULT_IDENTITY),'utf8'));
  const workstreams=JSON.parse(fs.readFileSync(path.join(root,DEFAULT_WORKSTREAMS),'utf8'));
  return {identity,workstreams};
}
export async function main(argv=process.argv.slice(2)){
  const mode=argv.includes('--public')?'public':'review';
  const {identity,workstreams}=loadSource();
  assertPublicReleaseDenied(mode,workstreams,identity);
  const idx=argv.indexOf('--output');
  const dest=idx>=0?argv[idx+1]:path.join(ROOT,'tmp','evercraft-brand-review.html');
  if(!dest||!dest.endsWith('.html'))throw Error('Explicit .html output expected');
  const absolute=path.resolve(dest);
  if(absolute.startsWith(path.resolve(ROOT,'public')+path.sep))throw Error('Review compiler cannot write under public/');
  const html=compileReview(workstreams,identity);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  fs.writeFileSync(absolute,html);
  console.log('Review-only portfolio rendered:',absolute,'('+workstreams.workstreams.length+' workstreams, zero publication approvals)');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
