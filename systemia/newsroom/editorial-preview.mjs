#!/usr/bin/env node
// Source-grounded editorial previews only. This module NEVER issues Journal/Clip publication authority.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const inline=v=>esc(v).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>');

export function assertSafeEditorialPreviewPath(filePath,root=path.resolve(here,'../..')){
  const dest=path.resolve(filePath);
  for(const part of ['public','dist','build','.github','systemia/newsroom/stories']){
    const blocked=path.resolve(root,part);
    if(dest===blocked||dest.startsWith(blocked+path.sep)) throw Error('Editorial preview cannot be written to publication or release paths');
  }
  if(!dest.toLowerCase().endsWith('.html')) throw Error('Preview destination must be .html');
  return dest;
}
export function extractArticle(markdown){
  const src=String(markdown??'');
  const marker=/(?:^|\n)## Article\n/.exec(src);
  if(!marker) throw Error('Candidate must contain a distinct ## Article section');
  const tail=src.slice(marker.index+marker[0].length);
  const end=tail.search(/\n(?:\*\*Follow-up source check|## (?:Primary source and claim ledger|Source and claim ledger|Visual provenance|Publication and distribution receipt ledger))/);
  const article=(end<0?tail:tail.slice(0,end)).trim();
  if(!article.startsWith('# ')) throw Error('Article must start with a level-one title');
  if((article.match(/^## /gm)||[]).length<3) throw Error('Preview requires at least three substantive article sections');
  if(article.length<1200) throw Error('Preview article is too short');
  return article;
}
function renderProse(article){
  return article.split(/\n\s*\n/).filter(Boolean).map(block=>{
    const b=block.trim();
    if(b.startsWith('# ')) return '<h1>'+inline(b.slice(2))+'</h1>';
    if(b.startsWith('## ')) return '<h2>'+inline(b.slice(3))+'</h2>';
    return '<p>'+inline(b.replace(/\n/g,' '))+'</p>';
  }).join('\n');
}
const defaultDesktopSvg=()=>fs.readFileSync(path.join(here,'editorial-assets/chainsaw-surgical-origins-concept.svg'),'utf8');
const defaultMobileSvg=()=>fs.readFileSync(path.join(here,'editorial-assets/chainsaw-surgical-origins-mobile.svg'),'utf8');
function inlineOwnedSvg(svg){
  if(typeof svg!=='string'||!/^<svg\s[\s\S]*<\/svg>\s*$/.test(svg.trim())) throw Error('Owned SVG illustration missing or malformed');
  if(/<script\b|<foreignObject\b|<image\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=/i.test(svg)) throw Error('SVG contains unsupported active or external elements');
  return 'data:image/svg+xml;base64,'+Buffer.from(svg,'utf8').toString('base64');
}
export function renderEditorialPreview({markdown,manifest,desktopSvg=defaultDesktopSvg(),mobileSvg=defaultMobileSvg()}){
  if(manifest?.schema!=='evercraft.journal.editorial-preview-media.v1') throw Error('Preview manifest schema mismatch');
  const h=manifest.hero||{};
  if(h.rights_state!=='verified_public_domain') throw Error('Hero media must have verified public-domain rights');
  if(!h.creator||!h.source_url||!h.license_evidence_url||!h.image_url||!h.alt||!h.caption) throw Error('Hero provenance incomplete');
  for(const key of ['source_url','license_evidence_url','image_url']) if(!h[key].startsWith('https://')) throw Error(key+' must be HTTPS');
  if(!Array.isArray(manifest.sources)||manifest.sources.length<2) throw Error('At least two references required');
  // The screenshoted iPhone preview cannot rely on remote images; both variants are inline and offline.
  const desktopImage=inlineOwnedSvg(desktopSvg);
  const mobileImage=inlineOwnedSvg(mobileSvg);
  const article=extractArticle(markdown);
  const title=article.split('\n')[0].slice(2);
  const references=manifest.sources.map(s=>{
    if(!s.label||!s.url?.startsWith('https://')) throw Error('Source provenance missing');
    return '<li><a href="'+esc(s.url)+'" rel="noopener noreferrer">'+esc(s.label)+'</a><small>'+esc(s.note||'')+'</small></li>';
  }).join('');
  const css=":root{color-scheme:dark;--bg:#0b131a;--fg:#f6f1e9;--muted:#b7c4c9;--gold:#d3b483;--blue:#89c9eb}*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;line-height:1.75}a{color:var(--blue)}.wrap{max-width:1040px;margin:auto;padding:0 22px}.ribbon{background:#18313b;color:#e5ceac;padding:12px 0;text-transform:uppercase;letter-spacing:.09em;font-weight:700;font-size:.74rem}.ribbon .wrap{display:flex;justify-content:space-between;gap:16px}header{padding:30px 0;border-bottom:1px solid #354c58}.brand{font-size:.82rem;letter-spacing:.16em;font-weight:900;text-transform:uppercase}.brand b{color:var(--gold)}.hero{padding-top:34px;display:grid;grid-template-columns:1.12fr .88fr;gap:32px;align-items:center}.eyebrow{font-size:.79rem;letter-spacing:.17em;text-transform:uppercase;color:var(--gold);font-weight:800}header h1{font:700 clamp(2.5rem,6vw,4.8rem)/1.05 Georgia,serif;letter-spacing:-.035em;margin:20px 0}header p,figcaption{color:var(--muted)}figure{margin:0}img{width:100%;display:block;border-radius:14px;border:1px solid #425966}figcaption{font-size:.8rem;line-height:1.6;margin-top:10px}.meta{color:var(--muted);font-size:.83rem;margin-top:32px}.notice{max-width:760px;margin:40px auto;padding:16px 22px;background:#18313b;border-left:3px solid var(--gold)}article{max-width:760px;margin:40px auto 80px}article h1{font:700 clamp(2.2rem,5vw,4rem)/1.06 Georgia,serif}article h2{font:700 clamp(1.65rem,3vw,2.3rem)/1.2 Georgia,serif;margin:48px 0 18px}article p{font-size:1.09rem;color:#e1e8e6;margin-bottom:26px}article p:first-of-type{color:#e3d1af;font-size:1.2rem}.sources{border-top:1px solid #354c58;padding:24px 0 60px}.sources h2{font:700 2rem Georgia,serif}.sources li{padding:8px 0}.sources small{display:block;color:var(--muted)}footer{border-top:1px solid #354c58;color:var(--muted);padding:20px 0 40px;font-size:.8rem}@media(max-width:700px){.hero{display:block}.hero figure{margin-top:22px}article p{font-size:1.02rem}.ribbon .wrap{font-size:.66rem}}";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>'+esc(title)+' | Evercraft Journal editorial preview</title><style>'+css+'</style></head><body>'+
  '<div class="ribbon"><div class="wrap"><span>Editorial preview · Not published</span><span>Distribution on hold</span></div></div>'+
  '<header class="wrap"><div class="brand">Evercraft <b>Journal</b></div><div class="hero"><div><div class="eyebrow">Hidden History · Engineering &amp; Invention</div><h1>Before forests, there was surgery.</h1><p>In the 1780s, a linked cutting chain belonged in a surgeon’s hands. The full story is stranger, and more human, than the viral claim.</p></div><figure><picture><source media="(max-width:700px)" srcset="'+mobileImage+'"><img src="'+desktopImage+'" alt="Original conceptual illustration of an early hand-cranked surgical chain osteotome. Not a historical photograph or exact reconstruction." loading="eager" decoding="sync"></picture><figcaption>Original Evercraft editorial illustration, not a photograph or scale-accurate reconstruction. <a href="'+esc(h.source_url)+'">View the real historical osteotome photograph</a>, credited to '+esc(h.creator)+' ('+esc(h.license_label)+'). <a href="'+esc(h.license_evidence_url)+'">Source and rights statement</a>. The photographed instrument is Heine’s later osteotome, not Aitken’s 1785 saw.</figcaption></figure></div><div class="meta">Research-backed historical feature · '+esc(manifest.story_id)+' · Source/copy review continuing</div></header>'+
  '<main class="wrap"><aside class="notice"><strong>Not a live edition.</strong> This is a pre-release editorial preview of an evidence-based draft. Independent editorial review, Fallen production approval, Systemia release and live URL verification remain outstanding.</aside><article>'+renderProse(article)+'</article><section class="sources"><h2>Sources and documentation</h2><ol>'+references+'</ol><p>This artifact photograph depicts Heine’s later osteotome, not Aitken’s 1785 instrument.</p></section></main>'+
  '<footer><div class="wrap">Evercraft Journal · Editorial preparation only · No publication or distribution receipt issued</div></footer></body></html>';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const md=process.argv[2]||path.join(here,'editorial-queue/2026-11-02-chainsaw-surgical-origins.md');
  const media=process.argv[3]||path.join(here,'editorial-assets/chainsaw-surgical-origins-media.json');
  const out=assertSafeEditorialPreviewPath(process.argv[4]||path.join(os.tmpdir(),'evercraft-chainsaw-journal-preview.html'));
  const html=renderEditorialPreview({markdown:fs.readFileSync(md,'utf8'),manifest:JSON.parse(fs.readFileSync(media,'utf8'))});
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);
  process.stdout.write(JSON.stringify({schema:'evercraft.journal.editorial-preview.v1',state:'not_published',file:out,article_bytes:html.length,publication_receipt:false,clip_release:false})+'\n');
}
