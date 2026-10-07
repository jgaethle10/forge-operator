#!/usr/bin/env node
import process from 'node:process';

const GENERATED_PREFIXES=Object.freeze([
  'artifacts/',
  'public/journal/',
]);

function unquoteGitPath(value){
  const raw=String(value||'').trim();
  if(!(raw.startsWith('"')&&raw.endsWith('"'))) return raw;
  try{return JSON.parse(raw);}
  catch{return raw.slice(1,-1);}
}

function pathsFromPorcelainLine(line){
  const raw=String(line||'');
  if(raw.length<4) return [];
  const payload=raw.slice(3).trim();
  if(!payload) return [];
  const parts=payload.includes(' -> ')?payload.split(' -> '):[payload];
  return parts.map(unquoteGitPath).filter(Boolean);
}

function generatedKind(path){
  const value=String(path||'').replace(/^\.\//,'');
  if(value==='public/journal'||value.startsWith('public/journal/')) return 'journal';
  if(value==='artifacts'||value.startsWith('artifacts/')) return 'artifacts';
  return null;
}

export function classifyFabricCheckoutDirt(statusText=''){
  const lines=String(statusText||'').split(/\r?\n/).filter(Boolean);
  const generated=[];
  const blocking=[];
  let journalDirty=false;

  for(const line of lines){
    const paths=pathsFromPorcelainLine(line);
    if(!paths.length){
      blocking.push(line);
      continue;
    }
    const kinds=paths.map(generatedKind);
    if(kinds.every(Boolean)){
      generated.push(line);
      if(kinds.includes('journal')) journalDirty=true;
    }else{
      blocking.push(line);
    }
  }

  return {
    schema:'evercraft.fabric.checkout-dirt.v1',
    clean:lines.length===0,
    generated_only:lines.length>0&&blocking.length===0,
    journal_dirty:journalDirty,
    generated_lines:generated,
    blocking_lines:blocking,
  };
}

async function readStdin(){
  let body='';
  for await(const chunk of process.stdin) body+=chunk;
  return body;
}

async function main(){
  const result=classifyFabricCheckoutDirt(await readStdin());
  if(process.argv.includes('--blocking-lines')){
    process.stdout.write(result.blocking_lines.join('\n'));
    if(result.blocking_lines.length) process.stdout.write('\n');
    return;
  }
  if(process.argv.includes('--journal-dirty')){
    process.stdout.write(result.journal_dirty?'true':'false');
    return;
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if(import.meta.url===`file://${process.argv[1]}`){
  await main();
}
