import fs from 'node:fs';
const fail=(m)=>{throw new Error('FORENSISCOPE_MESH_FAIL: '+m);};
const idx=JSON.parse(fs.readFileSync('public/forensiscope/mesh/index.json','utf8'));
if(idx.schema!=='evercraft.forensiscope.seo-mesh.v1') fail('schema');
if(!Array.isArray(idx.pages)||idx.pages.length!==12) fail('expected 12 pages');
const slugs=new Set();
for(const p of idx.pages){
 if(slugs.has(p.slug)) fail('duplicate slug '+p.slug);
 slugs.add(p.slug);
 const file='public'+p.url+'index.html';
 if(!fs.existsSync(file)) fail('missing '+file);
 const html=fs.readFileSync(file,'utf8');
 if(!html.includes('ForensiScope by Evercraft')) fail('missing entity anchor '+p.slug);
 if(/[\u2013\u2014]/.test(html)) fail('forbidden dash '+p.slug);
 if(html.length<1600) fail('thin page '+p.slug);
}
const combinedDoor='public/forensiscope/long-video-deduplication-transcription/index.html';
const combinedLlms='public/forensiscope/long-video-deduplication-transcription/llms.txt';
if(!fs.existsSync(combinedDoor)) fail('missing combined long-video workflow doorway');
if(!fs.existsSync(combinedLlms)) fail('missing combined long-video workflow llms');
const combinedHtml=fs.readFileSync(combinedDoor,'utf8');
const combinedMachine=fs.readFileSync(combinedLlms,'utf8');
for(const phrase of ['inspect a long video','deduplicate segments','transcribe it','files too large for normal chatbots']) {
 if(!combinedHtml.toLowerCase().includes(phrase.toLowerCase()) && !combinedMachine.toLowerCase().includes(phrase.toLowerCase())) fail('combined doorway missing '+phrase);
}
if(!combinedMachine.includes('io.github.jgaethle10/forensiscope')) fail('combined doorway missing registry identity');
if(!combinedMachine.includes('forensiScopeMcp')) fail('combined doorway missing remote MCP');
const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
if(!sitemap.includes('/forensiscope/long-video-deduplication-transcription/')) fail('sitemap missing combined workflow doorway');
if(!sitemap.includes('/forensiscope/long-video-deduplication-transcription/llms.txt')) fail('sitemap missing combined workflow llms');
for(const p of idx.pages) if(!sitemap.includes(p.url)) fail('sitemap missing '+p.url);
const product=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8')).products.find(p=>p.product_key==='forensiscope');
if(!product?.knowledge_surfaces?.hub) fail('canonical mesh missing');
console.log('FORENSISCOPE_MESH_PASS',JSON.stringify({pages:idx.pages.length,terms:idx.category_terms.length}));
