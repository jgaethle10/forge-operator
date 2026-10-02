#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(".");
const EXTENSIONS = new Set([".js",".mjs",".cjs",".ts",".tsx",".jsx",".json",".yml",".yaml",".html"]);
const SKIP_DIRS = new Set([".git","node_modules","dist","build",".next",".venv","venv","coverage",".playwright",".rivet_pydeps"]);
const EVIDENCE_ONLY_SEGMENTS = [
  "/tests/",
  "/test/",
  "/fixtures/",
  "/docs/",
  "/systemia/migrations/base44-exit/",
];
const ACTIVE_ROOTS = [
  "systemia/",
  "src/",
  "scripts/",
  ".github/workflows/",
];
const SIGNALS = [
  { key:"legacy_public_url", re:/https?:\/\/[^\s"'\x60<>]*base44\.app[^\s"'\x60<>]*/ig },
  { key:"base44_sdk_import", re:/@base44\/sdk/ig },
  { key:"base44_entity_access", re:/\bentities\.[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*(filter|list|get|create|update|delete|bulkCreate|bulkUpdate)\b/gm },
  { key:"base44_function_invoke", re:/\bfunctions\s*\.\s*invoke\s*\(/gm },
  { key:"base44_client_symbol", re:/\b(?:base44|Base44)\s*\.\s*(?:entities|functions|integrations|auth)\b/gm },
];

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}
function rel(file) {
  return path.relative(ROOT,file).split(path.sep).join("/");
}
function walk(dir,out=[]) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full,out);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}
function lineOf(text,index) {
  return text.slice(0,index).split("\n").length;
}
function classify(file) {
  const normalized="/"+file;
  const base=path.basename(file).toLowerCase();
  if (
    EVIDENCE_ONLY_SEGMENTS.some(segment=>normalized.includes(segment)) ||
    /(?:^|\.)(?:test|spec|proof)\.[^.]+$/.test(base) ||
    base.includes(".test.") ||
    base.includes(".spec.") ||
    base.includes(".proof.")
  ) return "evidence_or_migration";
  if (file.startsWith("public/") || file.startsWith("registry/") || file.startsWith("distribution/")) return "public_surface";
  if (ACTIVE_ROOTS.some(root=>file.startsWith(root)) || ["server.ts","server.js"].includes(file)) return "active_runtime_candidate";
  return "other_source";
}
function excerpt(text,start,length=180) {
  return text.slice(Math.max(0,start-50),Math.min(text.length,start+length)).replace(/\s+/g," ").trim();
}

const findings=[];
for (const file of walk(ROOT).sort()) {
  const filePath=rel(file);
  let text;
  try { text=fs.readFileSync(file,"utf8"); } catch { continue; }
  for (const signal of SIGNALS) {
    signal.re.lastIndex=0;
    for (const match of text.matchAll(signal.re)) {
      findings.push({
        file:filePath,
        classification:classify(filePath),
        signal:signal.key,
        line:lineOf(text,match.index||0),
        excerpt:excerpt(text,match.index||0),
      });
    }
  }
}

const byClass={};
const bySignal={};
const byFile=new Map();
for (const row of findings) {
  byClass[row.classification]=(byClass[row.classification]||0)+1;
  bySignal[row.signal]=(bySignal[row.signal]||0)+1;
  if (!byFile.has(row.file)) byFile.set(row.file,{file:row.file,classification:row.classification,hits:0,signals:{}});
  const f=byFile.get(row.file);
  f.hits+=1;
  f.signals[row.signal]=(f.signals[row.signal]||0)+1;
}
const files=[...byFile.values()].sort((a,b)=>b.hits-a.hits||a.file.localeCompare(b.file));
const activeFiles=files.filter(row=>row.classification==="active_runtime_candidate");
const publicFiles=files.filter(row=>row.classification==="public_surface");

const payload={
  schema:"evercraft.systemia.base44-runtime-debt-inventory.v1",
  generated_at:new Date().toISOString(),
  source_root:".",
  scan_mode:"static_source_only",
  evidence_boundary:{
    runtime_execution_proven:false,
    production_use_proven:false,
    missing_match_means_no_dependency:false,
    purpose:"Locate candidate Base44 migration debt without upgrading static source to runtime truth."
  },
  summary:{
    finding_count:findings.length,
    file_count:files.length,
    active_runtime_candidate_files:activeFiles.length,
    public_surface_files:publicFiles.length,
    by_class:byClass,
    by_signal:bySignal,
  },
  priority_queue:[
    ...activeFiles.map(row=>({...row,priority:"runtime_first"})),
    ...publicFiles.map(row=>({...row,priority:"public_surface_second"})),
  ],
  files,
  findings,
};
payload.inventory_hash=sha256(JSON.stringify({summary:payload.summary,files:payload.files,findings:payload.findings}));

const outIndex=process.argv.indexOf("--out");
const out=outIndex>=0?String(process.argv[outIndex+1]||"").trim():"";
if (out) {
  const target=path.resolve(out);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(payload,null,2)+"\n");
}
process.stdout.write(JSON.stringify({
  status:"BASE44_RUNTIME_DEBT_INVENTORY_COMPLETE",
  inventory_hash:payload.inventory_hash,
  ...payload.summary,
  top_runtime_files:activeFiles.slice(0,20),
  top_public_files:publicFiles.slice(0,20),
},null,2)+"\n");
