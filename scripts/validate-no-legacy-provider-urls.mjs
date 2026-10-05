#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const roots=['conformance/products.json','distribution/direct-product-doors.json','public','registry'];
const legacy=/https?:\/\/(?:base44\.app|[^/\s"'<>]+\.base44\.app)(?:\/|$)/i;const mutated=/https?:\/\/[A-Za-z0-9._-]*legacy(?:%20| )provider\.app(?:\/|$)/i;const hits=[];
function walk(target){if(!fs.existsSync(target))return;const st=fs.statSync(target);if(st.isDirectory()){for(const e of fs.readdirSync(target,{withFileTypes:true})){const p=path.join(target,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&/\.(json|jsonld|txt|md|html|xml|yml|yaml|js|mjs|ts|tsx|jsx)$/i.test(e.name))walk(p);}return;}fs.readFileSync(target,'utf8').split(/\r?\n/).forEach((line,i)=>{if(legacy.test(line)||mutated.test(line))hits.push({file:target,line:i+1});});}
for(const r of roots)walk(r);if(hits.length){console.error(JSON.stringify({ok:false,error:'legacy_or_mutated_provider_public_url_detected',hits:hits.slice(0,200)},null,2));process.exit(1);}console.log(JSON.stringify({ok:true,state:'no_legacy_provider_public_urls'}));
