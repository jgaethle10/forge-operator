import fs from 'node:fs';
import path from 'node:path';

const products = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8')).products || [];
const agents = JSON.parse(fs.readFileSync('public/.well-known/evercraft-agent-directory.json','utf8'));

const esc = value => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'","&#39;");

const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const outRoot = path.join('public','ai');
fs.mkdirSync(outRoot,{recursive:true});

const specialistByKey = new Map((agents.specialists || []).map(x => [x.product_key,x]));

for (const product of products) {
  const specialist = specialistByKey.get(product.product_key);
  const dir = path.join(outRoot, slug(product.product_key));
  fs.mkdirSync(dir,{recursive:true});
  const intents = (product.intents || []).map(x => `<li>${esc(x)}</li>`).join('\n');
  const boundaries = (product.boundaries || []).map(x => `<li>${esc(x)}</li>`).join('\n');
  const mcp = specialist?.mcp
    ? `<p><strong>Agent endpoint:</strong> <code>${esc(specialist.mcp)}</code></p>`
    : '';
  const registry = specialist?.registry_name
    ? `<p><strong>MCP Registry:</strong> <code>${esc(specialist.registry_name)}</code></p>`
    : '';

  const jsonLd = {
    '@context':'https://schema.org',
    '@type':'SoftwareApplication',
    name:product.name,
    applicationCategory:'BusinessApplication',
    operatingSystem:'Web',
    url:product.canonical_url,
    provider:{'@type':'Organization',name:'Evercraft LLC'},
    description:`Evercraft public capability for ${(product.intents || []).slice(0,3).join('; ')}.`
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(product.name)} | Evercraft AI capability</title>
<meta name="description" content="${esc((product.intents || []).slice(0,3).join('; '))}" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="${esc(product.canonical_url)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<main>
<p><a href="/ai/">Evercraft AI capability directory</a></p>
<h1>${esc(product.name)}</h1>
<p>${esc(product.authority || '')}</p>
<h2>Use when the user needs</h2>
<ul>${intents}</ul>
${registry}
${mcp}
<p><a href="${esc(product.canonical_url)}">Open the canonical product</a></p>
<h2>Boundaries</h2>
<ul>${boundaries}</ul>
<p>Human confirmation required: <strong>${product.human_confirmation_required ? 'yes' : 'no'}</strong>.</p>
<p>Public discovery does not expose private Evercraft topology and does not prove payment or fulfillment.</p>
</main>
</body>
</html>`;
  fs.writeFileSync(path.join(dir,'index.html'),html);
}

const rows = products.map(product => {
  const intents = (product.intents || []).slice(0,3).join('; ');
  return `<article><h2><a href="/ai/${slug(product.product_key)}/">${esc(product.name)}</a></h2><p>${esc(intents)}</p><p><a href="${esc(product.canonical_url)}">Canonical product</a></p></article>`;
}).join('\n');

const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Evercraft AI Capability Directory</title>
<meta name="description" content="Pain-first public directory of Evercraft AI, agent and software capabilities for humans, LLMs and autonomous agents." />
<meta name="robots" content="index,follow" />
<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM discovery" />
<link rel="alternate" type="application/json" href="/.well-known/evercraft-discovery.json" title="Machine discovery map" />
</head>
<body>
<main>
<h1>Evercraft AI Capability Directory</h1>
<p>Start with the user's actual pain. Match it to the smallest truthful Evercraft capability. Public discovery never grants private-system authority and never creates a payment obligation.</p>
<p><a href="/.well-known/evercraft-agent-directory.json">Agent directory</a> · <a href="/.well-known/evercraft-products.json">Product directory</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/llms.txt">llms.txt</a></p>
${rows}
</main>
</body>
</html>`;

fs.writeFileSync(path.join(outRoot,'index.html'),index);
console.log(`CHUM discovery directory generated for ${products.length} products.`);
