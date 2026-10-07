#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args=new Set(process.argv.slice(2));
const jsonArg=process.argv.find((x)=>x.startsWith('--json='));
const outFile=jsonArg?jsonArg.slice('--json='.length):'';
const root=process.cwd();
const publicRoot=path.join(root,'public');

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

function count(re,text){
  return [...text.matchAll(re)].length;
}

function auditFile(file){
  const html=fs.readFileSync(file,'utf8');
  const rel=path.relative(root,file).replaceAll('\\','/');
  const isDemo=rel.startsWith('public/demos/');
  const issues=[];
  const evidence={};

  evidence.viewport=/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(html);
  if(!evidence.viewport) issues.push({severity:'high',code:'missing_mobile_viewport'});

  evidence.documentOverflowGuard=/overflow-x\s*:\s*(?:hidden|clip)/i.test(html);
  if(!evidence.documentOverflowGuard) issues.push({severity:isDemo?'high':'review',code:'missing_horizontal_overflow_guard'});

  evidence.maxWidthCap=/max-width\s*:\s*100%/i.test(html);
  if(isDemo&&!evidence.maxWidthCap) issues.push({severity:'high',code:'missing_max_width_cap'});

  evidence.shrinkSafeGrid=/minmax\(0\s*,\s*1fr\)/i.test(html);
  const hasGrid=/display\s*:\s*grid/i.test(html);
  if(isDemo&&hasGrid&&!evidence.shrinkSafeGrid) issues.push({severity:'high',code:'grid_not_shrink_safe'});

  evidence.iosTextStability=/-webkit-text-size-adjust\s*:\s*100%/i.test(html);
  if(isDemo&&!evidence.iosTextStability) issues.push({severity:'high',code:'missing_ios_text_stability'});

  evidence.formFont16=/font-size\s*:\s*16px/i.test(html);
  if(isDemo&&/(?:<input|<select|<textarea)/i.test(html)&&!evidence.formFont16){
    issues.push({severity:'high',code:'ios_form_zoom_risk'});
  }

  evidence.touch44=/min-height\s*:\s*44px/i.test(html);
  if(isDemo&&/(?:<button|<a\b|<input|<select)/i.test(html)&&!evidence.touch44){
    issues.push({severity:'high',code:'touch_target_contract_missing'});
  }

  const fixedMinWidths=[...html.matchAll(/min-width\s*:\s*(\d{3,})px/gi)].map((m)=>Number(m[1]));
  const largeMinWidths=fixedMinWidths.filter((n)=>n>390);
  evidence.largeFixedMinWidths=largeMinWidths;
  if(largeMinWidths.length) issues.push({severity:'high',code:'large_fixed_min_width',values:largeMinWidths});

  const largeFixedWidths=[...html.matchAll(/(?:^|[;{\s])width\s*:\s*(\d{3,})px/gi)].map((m)=>Number(m[1]));
  const riskyFixedWidths=largeFixedWidths.filter((n)=>n>430);
  evidence.largeFixedWidths=riskyFixedWidths;
  if(riskyFixedWidths.length) issues.push({severity:'review',code:'large_fixed_width',values:riskyFixedWidths.slice(0,10)});

  evidence.nowrapCount=count(/white-space\s*:\s*nowrap/gi,html);
  if(evidence.nowrapCount>0) issues.push({severity:'review',code:'nowrap_present',count:evidence.nowrapCount});

  evidence.vw100Count=count(/(?:width|min-width|max-width)\s*:\s*100vw/gi,html);
  if(evidence.vw100Count>0) issues.push({severity:'review',code:'viewport_width_unit_present',count:evidence.vw100Count});

  const closingHtml=count(/<\/html>/gi,html);
  evidence.closingHtml=closingHtml;
  if(closingHtml!==1) issues.push({severity:'high',code:'document_structure_duplicate',count:closingHtml});

  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  let scriptSyntax=true;
  for(const match of scripts){
    try{ new Function(match[1]); }
    catch{ scriptSyntax=false; break; }
  }
  evidence.inlineScriptSyntax=scriptSyntax;
  if(!scriptSyntax) issues.push({severity:'high',code:'inline_script_syntax_error'});

  const high=issues.filter((x)=>x.severity==='high').length;
  const review=issues.filter((x)=>x.severity==='review').length;
  return {
    path:rel,
    scope:isDemo?'strict_demo':'public_surface',
    status:high?'high_risk':review?'review':'pass',
    high_issues:high,
    review_issues:review,
    issues,
    evidence,
  };
}

const files=walk(publicRoot);
const results=files.map(auditFile);
const summary={
  schema:'evercraft.public-mobile-stability-audit.v1',
  generated_at:new Date().toISOString(),
  files_scanned:results.length,
  pass:results.filter((x)=>x.status==='pass').length,
  review:results.filter((x)=>x.status==='review').length,
  high_risk:results.filter((x)=>x.status==='high_risk').length,
  strict_demo_failures:results.filter((x)=>x.scope==='strict_demo'&&x.status==='high_risk').length,
};

console.log(JSON.stringify(summary,null,2));
for(const row of results.filter((x)=>x.status!=='pass').slice(0,60)){
  console.log(row.status.toUpperCase(),row.path,row.issues.map((x)=>x.code).join(','));
}

const report={...summary,results};
if(outFile){
  fs.mkdirSync(path.dirname(path.resolve(outFile)),{recursive:true});
  fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');
}

if(args.has('--strict-demos')&&summary.strict_demo_failures>0) process.exit(1);
