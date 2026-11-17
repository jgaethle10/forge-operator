import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('public/headquarters/index.html','utf8');
const style=fs.readFileSync('public/headquarters/tower.css','utf8');
const app=fs.readFileSync('public/headquarters/tower.mjs','utf8');
const mark=fs.readFileSync('public/headquarters/mark.svg','utf8');
const home=fs.readFileSync('systemia/evercraft-home/public/index.html','utf8');

test('corporate entrance has real departments with progressive enhancement',()=>{
  for(const id of ['main','top','company','explore','in-motion','contact','hero-title']){
    assert.ok(page.includes('id="'+id+'"'),'missing '+id);
  }
  assert.equal((page.match(/class="floor-button/g)||[]).length,4);
  for(const floor of ['engineering','intelligence','creative','services']){
    assert.ok(page.includes('data-floor="'+floor+'"'));
    assert.ok(app.includes(floor+':Object.freeze('));
  }
  assert.match(page,/aria-pressed="true"/);
  assert.match(page,/aria-live="polite"/);
  assert.match(page,/<noscript>/);
  assert.match(app,/textContent=/);
  assert.doesNotMatch(app,/innerHTML|eval\(|new Function/);
});

test('headquarters links point at source-backed published public routes',()=>{
  for(const path of ['journal','worlds','research','work-saban/report']){
    assert.ok(fs.existsSync('public/'+path+'/index.html'),'missing destination '+path);
    assert.ok(page.includes('/forge-operator/'+path+'/'),'missing published link '+path);
  }
  assert.ok(page.includes('https://fabric.systemiacommandcenters.com/offers'));
  assert.ok(page.includes('mailto:'));
  assert.ok(page.includes('Capabilities vary by product'));
  assert.doesNotMatch(page,/guaranteed sales|fully autonomous revenue|live visitors today/i);
});

test('visual system is owned, mobile-first and reduced-motion compatible',()=>{
  for(const asset of ['tower.css','tower.mjs','mark.svg']){
    assert.ok(fs.existsSync('public/headquarters/'+asset));
    assert.ok(page.includes('/headquarters/'+asset));
  }
  assert.match(mark,/<svg[\s>]/);
  assert.match(mark,/<title/);
  assert.match(style,/@media\(max-width:760px\)/);
  assert.match(style, /prefers-reduced-motion:reduce/);
  assert.match(page,/<a class="skip-link"/);
  assert.doesNotMatch(page,/<script[^>]*src="https?:\/\//);
  assert.doesNotMatch(page, /fonts\.googleapis|googletagmanager|base44\.app/i);
});

test('private executive floor remains behind existing Home authorization',()=>{
  const privateStart=home.indexOf('<main id="app-shell">');
  const privateEnd=home.indexOf('</main>',privateStart);
  const executiveStart=home.indexOf('id="executive-floor"');
  assert.ok(privateStart>=0 && privateEnd>privateStart);
  assert.ok(executiveStart>privateStart && executiveStart<privateEnd);
  for(const required of ['id="auth-screen"','id="login-form"','id="plan-form"','id="executive-floor"','id="portfolio"','id="signout"']){
    assert.ok(home.includes(required),'missing '+required);
  }
  for(const route of ['#command','#portfolio','apps.html','credentials.html']){
    assert.ok(home.includes('href="'+route+'"'),'missing '+route);
  }
  assert.ok(home.includes('Payments and actual buyer outcomes still require separate verified records.'));
  assert.ok(home.includes('Command status is sourced from the authenticated Home APIs above.'));
});
