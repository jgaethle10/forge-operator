#!/usr/bin/env node
// Internal Arase feature proof. Never issues publication, entitlement, or Clip authority.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const markdownFile=path.join(here,'editorial-queue/2026-10-31-arase-radiation-barrier.md');
const mediaFile=path.join(here,'editorial-assets/arase-may-2024-storm-media.json');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function url(x){const u=new URL(String(x||''));if(u.protocol!=='https:'||u.username||u.password)throw Error('candidate_source_url_unsafe');return u.toString();}

export function extractScienceCandidate(markdown){
 const text=String(markdown||'');
 const start=text.indexOf('\n## Article\n');
 if(start<0)throw Error('candidate_article_missing');
 const end=text.indexOf('\n## Source and claim ledger',start);
 if(end<0)throw Error('candidate_ledger_missing');
 const article=text.slice(start+12,end).trim();
 const chunks=article.split(/\n(?=### )/).map(s=>s.trim()).filter(Boolean);
 if(chunks.length<5)throw Error('candidate_sections_missing');
 const first=chunks[0].match(/^### ([^\n]+)\n\*([^\n]+)\*\s*\n([\s\S]+)/);
 if(!first)throw Error('candidate_headline_dek_missing');
 const sections=[{heading:'The storm, and a mystery',body:first[3].trim()}];
 for(const block of chunks.slice(1)){
  const match=block.match(/^### ([^\n]+)\n([\s\S]+)/);
  if(!match)throw Error('candidate_section_invalid');
  sections.push({heading:match[1].trim(),body:match[2].trim()});
 }
 if(sections.some(s=>s.body.length<180)||article.split(/\s+/).length<500)throw Error('candidate_article_not_substantive');
 return {title:first[1].trim(),dek:first[2].trim(),sections,article};
}

export function verifyScienceCandidate(markdown,manifest){
 const article=extractScienceCandidate(markdown);
 if(manifest?.schema!=='evercraft.journal.editorial-candidate-media.v1' ||
    manifest.story_id!=='journal:2026-10-31:arase-radiation-barrier' ||
    manifest.publication_state!=='editorial_draft_only')throw Error('candidate_release_boundary_invalid');
 const hero=manifest.hero||{};
 if(hero.rights_review_status!=='candidate_not_approved_for_release')throw Error('candidate_rights_release_boundary_invalid');
 for(const key of ['image_url','source_url','supporting_image_page','rights_guideline_url'])url(hero[key]);
 if(new URL(hero.image_url).hostname!=='svs.gsfc.nasa.gov' ||
    !new URL(hero.image_url).pathname.startsWith('/vis/'))throw Error('candidate_image_source_not_verified');
 if(!hero.alt||!hero.caption||!hero.photographer_credit||!hero.capture_date)throw Error('candidate_hero_provenance_missing');
 if(!Array.isArray(manifest.sources)||manifest.sources.length<3)throw Error('candidate_sources_missing');
 const seen=new Set();
 for(const source of manifest.sources){
  const src=url(source.url);
  if(!source.label||seen.has(src)||!markdown.includes(source.url))throw Error('candidate_source_not_bound');
  seen.add(src);
 }
 if(!Array.isArray(manifest.release_holds)||manifest.release_holds.length<5)throw Error('candidate_holds_missing');
 return article;
}
function paragraphHtml(input){
 return String(input).split(/\n\s*\n/).filter(Boolean).map(p=>'<p>'+esc(p.trim().replace(/\n/g,' '))+'</p>').join('\n');
}

export function renderScienceCandidate({markdown,manifest}){
 const a=verifyScienceCandidate(markdown,manifest);
 const h=manifest.hero;
 const toc=a.sections.map((s,i)=>'<li><a href="#section-'+(i+1)+'">'+esc(s.heading)+'</a></li>').join('');
 const story=a.sections.map((s,i)=>'<section id="section-'+(i+1)+'"><h2>'+esc(s.heading)+'</h2>'+paragraphHtml(s.body)+'</section>').join('');
 const sources=manifest.sources.map(s=>'<li><a target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(s.label)+'</a></li>').join('');
 const css=[
 ':root{color-scheme:dark;--bg:#0b1215;--ink:#f0f2ee;--mint:#9bd9cc;--gold:#dbb98a;--muted:#adc1bf;--rule:#304547}',
 '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.65}a{color:inherit}a:focus-visible{outline:3px solid var(--mint);outline-offset:4px}',
 '.wrap{width:min(1140px,calc(100% - 36px));margin:auto}.ribbon{background:var(--gold);padding:11px;text-align:center;color:#142124;font-size:.75rem;text-transform:uppercase;letter-spacing:.11em;font-weight:850}',
 'header{border-bottom:1px solid var(--rule);padding:20px 0}.brand{font:700 1.5rem Georgia,serif;letter-spacing:-.04em}.brand span{color:var(--mint)}.kicker{color:var(--gold);letter-spacing:.11em;text-transform:uppercase;font-size:.75rem;font-weight:800}',
 '.hero{display:grid;grid-template-columns:1fr 1.05fr;gap:36px;align-items:center;padding:42px 0}.hero h1{font:500 clamp(2.7rem,5.5vw,5.1rem)/1.07 Georgia,serif;letter-spacing:-.05em;margin:14px 0 20px}.hero p{color:var(--muted);font-size:1.16rem}.hero figure{margin:0}.hero img{width:100%;height:420px;object-fit:cover;display:block}.hero figcaption{font-size:.75rem;line-height:1.5;color:var(--muted);padding-top:10px}',
 '.notice{color:var(--muted);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:18px 0;font-size:.87rem}.notice b{color:var(--gold)}',
 '.reading{display:grid;grid-template-columns:240px minmax(0,690px);gap:70px;padding:50px 0}.toc{position:sticky;top:20px;align-self:start}.toc h2{font:500 1.45rem Georgia,serif;color:var(--gold)}.toc ol{padding-left:20px;color:var(--muted);font-size:.89rem}.toc li{margin:12px 0}.toc a{text-decoration:none}',
 '.article{font:1.17rem/1.8 Georgia,serif}.article section{margin-bottom:45px;scroll-margin-top:18px}.article h2{font-size:1.9rem;line-height:1.2;letter-spacing:-.03em}.article p{margin:0 0 23px}.sources{padding:28px 0 65px;border-top:2px solid var(--gold)}.sources h2{font:500 2rem Georgia,serif}.sources li{margin:10px 0}.sources p,footer{font-size:.86rem;color:var(--muted)}footer{padding:22px 0;border-top:1px solid var(--rule)}',
 '@media(max-width:850px){.hero{grid-template-columns:1fr}.hero img{height:auto;max-height:420px}.reading{grid-template-columns:1fr;gap:20px}.toc{position:static;border-bottom:1px solid var(--rule)}.toc ol{columns:2}}@media(max-width:530px){.hero{padding:25px 0;gap:20px}.hero h1{font-size:clamp(2.5rem,10vw,3.5rem)}.hero img{height:260px}.toc ol{columns:1}.article{font-size:1.08rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'
 ].join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="evercraft:publication_state" content="editorial_draft_only"><title>'+esc(a.title)+' | Evercraft Journal editorial review</title><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src https://svs.gsfc.nasa.gov; style-src &#39;unsafe-inline&#39;"><style>'+css+'</style></head><body>'+
 '<div class="ribbon">Editorial proof · Not published · No distribution authorization</div><header><div class="wrap"><div class="brand">Evercraft <span>Journal</span></div><div class="kicker">Science &amp; Discovery · Curiosity Desk</div></div></header>'+
 '<main class="wrap"><div class="hero"><div><p class="kicker">The Curiosity Desk / Evidence-backed reporting</p><h1>'+esc(a.title)+'</h1><p>'+esc(a.dek)+'</p><small>May 2024 storm · October 2026 research · Editorial review only</small></div><figure><img loading="eager" referrerpolicy="no-referrer" src="'+esc(h.image_url)+'" alt="'+esc(h.alt)+'"><figcaption>'+esc(h.caption)+' Credit: '+esc(h.photographer_credit)+'. <a href="'+esc(h.source_url)+'">NASA source</a></figcaption></figure></div>'+
 '<div class="notice"><b>Image provenance:</b> This is a real photograph of the May 2024 aurora, not Arase electron measurements. This candidate image must be rights-reviewed and pinned locally before publication; it is for editorial review only.</div>'+
 '<div class="reading"><nav class="toc" aria-label="Story sections"><h2>Inside the story</h2><ol>'+toc+'</ol></nav><article class="article">'+story+'</article></div><section class="sources"><h2>Evidence &amp; original sources</h2><ol>'+sources+'</ol><p>Unverified interpretation is labeled in the source article. Source and photo credits do not imply NASA or researcher endorsement.</p></section></main><footer><div class="wrap">Evercraft Journal · Private proof only. Not indexed, released or distributed.</div></footer></body></html>';
}

export function approvedProofPath(filePath,repoRoot=root){
 const target=path.resolve(filePath);
 if(!target.endsWith('.html'))throw Error('candidate_preview_extension_invalid');
 if(target===repoRoot||target.startsWith(repoRoot+path.sep))throw Error('candidate_preview_cannot_enter_repository');
 return target;
}
export function createScienceProof({markdown,manifest,output=path.join(os.tmpdir(),'evercraft-arase-editorial-review.html')}){
 const file=approvedProofPath(output);
 const html=renderScienceCandidate({markdown,manifest});
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,html);
 return {schema:'evercraft.journal.candidate-proof.v1',output:file,publication_state:'editorial_draft_only',release_authorized:false,clip_authorized:false,source_sha256:hash(markdown),manifest_sha256:hash(JSON.stringify(manifest)),html_sha256:hash(html)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const markdown=fs.readFileSync(markdownFile,'utf8');
 const manifest=JSON.parse(fs.readFileSync(mediaFile,'utf8'));
 process.stdout.write(JSON.stringify(createScienceProof({markdown,manifest,output:process.argv[2]||undefined}),null,2)+'\n');
}
