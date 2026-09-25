import fs from 'node:fs';

const fail=(message)=>{throw new Error('FORENSISCOPE_DEV_HUB_FAIL: '+message);};
const readJson=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));

const required=[
  'public/forensiscope/developers/index.html',
  'public/forensiscope/developers/quickstart.html',
  'public/forensiscope/developers/mcp.html',
  'public/forensiscope/developers/workflows.html',
  'public/forensiscope/developers/integrations.html',
  'public/forensiscope/developers/status.html',
  'public/forensiscope/developers/status.json',
  'public/forensiscope/developers/examples.json',
  'public/forensiscope/developers/llms.txt',
  'public/forensiscope/video-understanding/index.html',
  'public/forensiscope/semantic-video-search/index.html',
  'public/forensiscope/duplicate-segments/index.html',
  'public/forensiscope/long-video-transcription/index.html'
];
for(const p of required) if(!fs.existsSync(p)) fail('missing '+p);

const status=readJson('public/forensiscope/developers/status.json');
const manifest=readJson('registry/forensiscope/server.json');
const directory=readJson('public/.well-known/evercraft-products.json');
const discovery=readJson('public/forensiscope/discovery.json');
const product=directory.products.find((p)=>p.product_key==='forensiscope');

if(status.schema!=='evercraft.forensiscope.developer-status.v1') fail('unexpected status schema');
if(status.mcp.registry_name!==manifest.name) fail('status registry name drift');
if(status.mcp.manifest_version!==manifest.version) fail('status MCP version drift');
if(status.mcp.transport!=='streamable-http') fail('unexpected MCP transport');
if(status.machine_media_intake?.state!=='verification_gated') fail('machine intake truth boundary weakened');
if(status.central_machine_checkout?.state!=='verification_gated') fail('central checkout truth boundary weakened');
if(status.technical_limits?.exact_file_size_ceiling!=='not_publicly_verified') fail('unverified file-size ceiling was promoted');
if(status.payment?.checkout_is_payment_proof!==false) fail('checkout/payment boundary weakened');
if(!product) fail('canonical product directory missing ForensiScope');
if(!product.developer_surfaces?.hub) fail('developer hub missing from canonical product directory');
if(!Array.isArray(product.commercial?.offers)||product.commercial.offers.length!==5) fail('published duration tiers missing from product directory');
if(!Array.isArray(product.aliases)||!product.aliases.includes('ForensiScope by Evercraft')) fail('brand alias missing');
if(discovery.developer?.hub!=='/forensiscope/developers/') fail('developer hub missing from discovery map');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of [
  '/forensiscope/developers/',
  '/forensiscope/developers/status.json',
  '/forensiscope/video-understanding/',
  '/forensiscope/semantic-video-search/',
  '/forensiscope/duplicate-segments/',
  '/forensiscope/long-video-transcription/'
]) if(!sitemap.includes(route)) fail('sitemap missing '+route);

const llms=fs.readFileSync('public/forensiscope/developers/llms.txt','utf8');
for(const phrase of ['AI video understanding','semantic video search','secure machine media intake remains verification-gated','exact public file-size ceiling is not verified']){
  if(!llms.includes(phrase)) fail('developer LLM guide missing: '+phrase);
}

console.log('FORENSISCOPE_DEV_HUB_PASS',JSON.stringify({
  developer_surfaces:required.length,
  manifest_version:manifest.version,
  pricing_tiers:product.commercial.offers.length,
  machine_intake:status.machine_media_intake.state,
  exact_file_size_ceiling:status.technical_limits.exact_file_size_ceiling
}));
