import fs from 'node:fs';

const fail=(message)=>{throw new Error('FORENSISCOPE_EDITORIAL_FAIL: '+message);};
const read=(p)=>fs.readFileSync(p,'utf8');
const readJson=(p)=>JSON.parse(read(p));

const index=readJson('public/forensiscope/editorial/index.json');
if(index.schema!=='evercraft.forensiscope.editorial-index.v1') fail('unexpected editorial index schema');
if(!Array.isArray(index.articles)||index.articles.length<8) fail('expected at least 8 editorial articles');

const requiredTerms=[
  'AI video understanding',
  'long-video analysis',
  'video intelligence',
  'semantic video search',
  'transcription',
  'duplicate video segments'
];
const combined=[...(index.category_terms||[]), ...index.articles.flatMap((a)=>[a.title,a.description])].join(' ');
for(const term of requiredTerms) if(!combined.toLowerCase().includes(term.toLowerCase())) fail('missing category term '+term);

for(const tool of ['Twelve Labs','Gemini','K2','Echosaw','AssemblyAI']){
  if(!combined.includes(tool)) fail('missing named tool '+tool);
}

for(const article of index.articles){
  const p='public'+article.url+'index.html';
  if(!fs.existsSync(p)) fail('missing article '+p);
  const html=read(p);
  if(!html.includes('ForensiScope')) fail('article does not anchor ForensiScope: '+p);
  if(!html.includes('Evercraft')) fail('article does not anchor Evercraft: '+p);
}

const product=readJson('public/.well-known/evercraft-products.json').products.find((p)=>p.product_key==='forensiscope');
if(!product?.editorial_surfaces?.hub) fail('canonical product directory missing editorial hub');

const discovery=readJson('public/forensiscope/discovery.json');
if(discovery.editorial?.hub!=='/forensiscope/editorial/') fail('product discovery missing editorial hub');

const social=readJson('public/forensiscope/editorial/social-pack.json');
if(!Array.isArray(social.posts)||social.posts.length<5) fail('social publishing pack missing');
if(!String(social.publishing_note||'').includes('do not blast identical copy')) fail('anti-spam publishing rule missing');

const sitemap=read('public/sitemap.xml');
for(const route of [
  '/forensiscope/editorial/',
  '/forensiscope/editorial/llms.txt',
  '/forensiscope/editorial/forensiscope-vs-twelve-labs/',
  '/forensiscope/editorial/forensiscope-vs-gemini/',
  '/forensiscope/editorial/video-too-large-for-chatgpt/',
  '/forensiscope/editorial/deduplicate-long-video-segments/'
]) if(!sitemap.includes(route)) fail('sitemap missing '+route);

console.log('FORENSISCOPE_EDITORIAL_PASS',JSON.stringify({
  articles:index.articles.length,
  social_posts:social.posts.length,
  category_terms:index.category_terms.length
}));
