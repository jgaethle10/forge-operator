import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const publicPage=fs.readFileSync('public/headquarters/index.html','utf8');
const command=fs.readFileSync('systemia/evercraft-home/public/index.html','utf8');

test('headquarters is a genuine public company front door',()=>{
  for(const needed of ['<title>Evercraft |','id="company"','id="explore"','id="contact"','Built to endure.','Designed to empower.','mailto:','/journal/','/offers','/chum/']){
    assert.ok(publicPage.includes(needed),'missing '+needed);
  }
  assert.match(publicPage,/name="viewport"/);
  assert.match(publicPage,/<main id="main">/);
  assert.match(publicPage,/<a class="skip"/);
  assert.match(publicPage,/No physical public office is represented/i);
  assert.doesNotMatch(publicPage,/base44\.app|fake.live|pretend\s+(revenue|live)|guaranteed/i);
  assert.doesNotMatch(publicPage,/<form[\s>]/i,'public homepage should not imitate an intake backend');
});

test('executive Home remains the private operational surface',()=>{
  for(const required of ['id="auth-screen"','id="login-form"','id="app-shell"','id="plan-form"','id="brief"','id="command"','id="portfolio"','id="evercraft-command-identity"','id="signout"','id="claim-form"']){
    assert.ok(command.includes(required),'missing '+required);
  }
  assert.ok(command.includes('Prepare in Systemia'));
  assert.ok(command.includes('Private · Evercraft controlled'));
  assert.ok(command.includes('credentials.html'));
  assert.ok(command.includes('apps.html'));
  assert.ok(command.includes('evercraft-command-metal'));
});

test('headquarters Pages root is not redirected to the technical directory',()=>{
  const pages=fs.readFileSync('.github/workflows/evercraft-journal-pages.yml','utf8');
  assert.ok(pages.includes('cp _public_pages/headquarters/index.html _public_pages/index.html'));
  assert.ok(pages.includes('HEADQUARTERS_PUBLIC_ROOT_HTTPS_VERIFIED'));
  assert.ok(pages.includes("test -s _public_pages/headquarters/index.html"));
  assert.ok(!pages.includes('meta http-equiv="refresh" content="0; url=/forge-operator/chum/"'));
  assert.ok(pages.includes('test -f _public_pages/chum/index.html'));
});
