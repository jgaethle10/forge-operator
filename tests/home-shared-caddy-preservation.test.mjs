import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer=fs.readFileSync(new URL('../scripts/install-evercraft-home-edge.sh',import.meta.url),'utf8');
test('Home convergence does not overwrite existing shared Home+Fabric Caddyfile',()=>{
  const guard=installer.indexOf('if [[ -s "$CADDYFILE" ]]; then');
  const preserve=installer.indexOf('CADDY_TEMPLATE_REQUIRED');
  assert.equal(preserve,-1);
  const template=installer.indexOf('cat > "$CADDYFILE"');
  assert.ok(guard>0&&guard<template);
  const span=installer.slice(guard,template);
  assert.ok(span.includes("grep -Fq 'handle_path /home/*'"));
  assert.ok(span.includes("grep -Fq 'reverse_proxy 127.0.0.1:4310'"));
  assert.ok(span.includes("grep -Fq 'reverse_proxy 127.0.0.1:8787'"));
  assert.ok(span.includes('preserving the shared public Caddyfile'));
  assert.ok(span.includes('exit 7'));
  assert.ok(span.trimEnd().endsWith('else'));
  assert.ok(installer.includes('EOF\nfi\n\nsystemctl daemon-reload'));
});
