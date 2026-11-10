#!/usr/bin/env node
// Capture deterministic browser proof of the generated owned Journal.
// Uses the browser preinstalled on GitHub's Ubuntu runner; never opens legacy hosts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const root = path.resolve(process.argv[2] || 'public/journal');
const file = path.join(root,'index.html');
const out = path.resolve(process.argv[3] || 'artifacts/journal-visual-qa');
if (!fs.existsSync(file)) throw new Error('journal_visual_qa_missing_index');
const html = fs.readFileSync(file,'utf8');
if (!html.includes('<body>') || !html.includes('</body>')) throw new Error('journal_visual_qa_html_invalid');
fs.mkdirSync(out,{recursive:true});
const probeDir=fs.mkdtempSync(path.join(os.tmpdir(),'journal-visual-'));
const executable = [process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean)
  .find((candidate)=>spawnSync(candidate,['--version'],{encoding:'utf8',timeout:5000}).status===0);
if (!executable) throw new Error('journal_visual_qa_chromium_missing');

const suffix = `<script>
  window.addEventListener('load',()=>{
    const doc=document.documentElement;
    document.body.dataset.qaHorizontalOverflow=String(doc.scrollWidth>window.innerWidth+1);
    document.body.dataset.qaNavVisible=String([...document.querySelectorAll('nav a')].some(a=>getComputedStyle(a).display!=='none'));
    document.body.dataset.qaFeatured=String(Boolean(document.getElementById('lead-title')));
    document.body.dataset.qaViewport=String(window.innerWidth);
  });
</script></body>`;
const modified = html.replace('</body>',suffix);
const probe = path.join(probeDir,'index.html');
fs.writeFileSync(probe,modified);
const target='file://'+probe;
const results=[];
for(const spec of [{name:'phone',width:390,height:844},{name:'desktop',width:1440,height:900}]){
  const common=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--hide-scrollbars','--force-device-scale-factor=1',`--window-size=${spec.width},${spec.height}`,'--virtual-time-budget=1200'];
  const png=path.join(out,`journal-${spec.name}.png`);
  const shot=spawnSync(executable,[...common,`--screenshot=${png}`,target],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  if(shot.status!==0||!fs.existsSync(png)||fs.statSync(png).size<2000){
    throw new Error('journal_visual_qa_capture_failed:'+spec.name+':'+String(shot.stderr||shot.error).slice(0,700));
  }
  const dom=spawnSync(executable,[...common,'--dump-dom',target],{encoding:'utf8',timeout:30000,maxBuffer:12*1024*1024});
  if(dom.status!==0)throw new Error('journal_visual_qa_dom_failed:'+spec.name);
  const attr=(name)=>(dom.stdout.match(new RegExp('data-'+name+'="([^"]*)"'))||[])[1]||'';
  const overflow=attr('qa-horizontal-overflow');
  const nav=attr('qa-nav-visible');
  const featured=attr('qa-featured');
  if(overflow!=='false'||nav!=='true'||featured!=='true'){
    throw new Error('journal_visual_qa_failed:'+spec.name+JSON.stringify({overflow,nav,featured,viewport:attr('qa-viewport')}));
  }
  results.push({viewport:spec.name,expected_width:spec.width,observed_width:Number(attr('qa-viewport')),horizontal_overflow:false,nav_visible:true,featured_story_visible:true,screenshot:path.relative(process.cwd(),png)});
}
const report={schema:'evercraft.journal.visual-qa.v1',pass:true,source:'public/journal/index.html',results};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
