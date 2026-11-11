export function validateCatalog(data){
 if(!data||data.schema!=="evercraft.passage.demo-library.v1"||!Array.isArray(data.articles))throw Error("Unrecognized library format");
 const ids=new Set();
 for(const a of data.articles){
  if(!a||typeof a.id!=="string"||!/^[a-z0-9-]{1,60}$/.test(a.id)||ids.has(a.id))throw Error("Invalid or duplicate article ID");
  ids.add(a.id);
  for(const key of ["category","title","description","rights","edition"]){if(typeof a[key]!=="string"||!a[key].trim())throw Error("Missing article "+key);}
  if(!Array.isArray(a.sections)||a.sections.length===0)throw Error("Article is missing sections");
  for(const s of a.sections){if(typeof s.heading!=="string"||!Array.isArray(s.paragraphs)||s.paragraphs.some(p=>typeof p!=="string"))throw Error("Invalid section")}
  if(!Array.isArray(a.sources)||a.sources.some(s=>!s||typeof s.label!=="string"||typeof s.url!=="string"||!s.url.startsWith("https://")))throw Error("Invalid reference");
 }
 return data;
}
export function filterArticles(articles,category,query){
 const q=(query||"").trim().toLocaleLowerCase();
 return articles.filter(a=>(category==="All"||a.category===category)&&(!q||[a.title,a.description,a.category,...a.sections.flatMap(s=>[s.heading,...s.paragraphs])].join(" ").toLocaleLowerCase().includes(q)));
}
export function escapeHTML(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
export function portableHTML(data){
 validateCatalog(data);
 const esc=escapeHTML;
 const pages=data.articles.map(a=>'<article><p class="meta">'+esc(a.category)+' · '+esc(a.edition)+'</p><h2 id="'+esc(a.id)+'">'+esc(a.title)+'</h2><p>'+esc(a.description)+'</p>'+a.sections.map(s=>'<h3>'+esc(s.heading)+'</h3>'+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join("")).join("")+'<p class="rights">Rights: '+esc(a.rights)+'</p>'+(a.sources.length?'<p class="rights">Further reading: '+a.sources.map(s=>esc(s.label)+" · "+esc(s.url)).join("; ")+'</p>':"")+'</article>').join("");
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Passage offline library</title><style>body{font:17px/1.75 system-ui,sans-serif;color:#173b36;background:#f7f9f6;max-width:760px;margin:auto;padding:24px}h1,h2,h3{line-height:1.15}h1{font-size:3rem;letter-spacing:-.05em}h2{font-size:2rem;letter-spacing:-.04em}article{border-top:1px solid #b4cdc2;padding:25px 0 45px}.meta,.rights,small{font-size:.82rem;color:#52776d}p{overflow-wrap:anywhere}</style></head><body><h1>passage.</h1><p>Offline demonstration library · Edition '+esc(data.edition)+'</p><p><strong>Personal offline copy.</strong> This file is unencrypted. Source links are references, not independently verified claims. Original demonstration text; broad redistribution rights not approved.</p>'+pages+'<footer><small>Evercraft Passage prototype · No network needed to open this file.</small></footer></body></html>';
}
