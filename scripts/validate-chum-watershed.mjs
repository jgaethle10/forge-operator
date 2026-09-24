import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'); const json=p=>JSON.parse(read(p));
const fail=m=>{console.error('FAIL:',m);process.exitCode=1}; const pass=m=>console.log('PASS:',m);
const required=['public/llms.txt','public/llms-full.txt','public/robots.txt','public/sitemap.xml','public/ai-discovery.json','public/openapi.json','public/.well-known/evercraft-agent.json','public/.well-known/agent-card.json','public/.well-known/evercraft-products.json','public/.well-known/evercraft-chum.json','public/chum/index.html'];
for(const p of required){fs.existsSync(p)?pass('present '+p):fail('missing '+p)}
const robots=read('public/robots.txt');
for(const bot of ['OAI-SearchBot','Claude-SearchBot','Googlebot','Google-Extended','bingbot','PerplexityBot']) robots.includes(bot)?pass('crawler '+bot):fail('crawler policy missing '+bot);
const d=json('public/ai-discovery.json'); if(!d.routes?.product_directory||!d.routes?.chum||!d.machine_commerce?.universal_mcp) fail('discovery map incomplete'); else pass('discovery map routes portfolio + CHUM + MCP');
const api=json('public/openapi.json'); if(!api.paths?.['/api/forge']||!api.paths?.['/api/resolve/media-overflow']) fail('OpenAPI missing wired public endpoints'); else pass('OpenAPI covers wired public endpoints');
if(process.exitCode) throw new Error('CHUM watershed validation failed');
console.log('CHUM WATERSHED PASS');
