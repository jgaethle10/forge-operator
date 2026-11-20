import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS, CATEGORIES, STATE_LABELS } from '../public/aiden-lab/catalog.mjs';
import { LEARNING_WORLDS, WORLD_STATES, LEARNING_SEQUENCE } from '../public/aiden-lab/learning-worlds.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/aiden-lab');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Aiden science catalog has real, source-bound research rooms', () => {
  assert.ok(TOPICS.length >= 12);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length);
  assert.ok(CATEGORIES.includes('Health & medicine'));
  assert.ok(CATEGORIES.includes('Earth & environment'));
  assert.ok(CATEGORIES.includes('Space & flight'));
  assert.ok(CATEGORIES.includes('Computing & robotics'));
  for (const topic of TOPICS) {
    assert.match(topic.id, /^[a-z0-9-]+$/);
    assert.ok(topic.title.length >= 10);
    assert.ok(topic.summary.length >= 30);
    assert.ok(topic.question.endsWith('?'));
    assert.ok(topic.evidence.length > 45);
    assert.ok(topic.unknown.length > 35);
    assert.ok(topic.icon);
    assert.ok(CATEGORIES.includes(topic.category));
    assert.ok(Object.hasOwn(STATE_LABELS, topic.state));
    assert.ok(topic.links.length >= 1);
    for (const link of topic.links) {
      assert.ok(link.label.length > 4);
      const url = new URL(link.url, 'https://evercraft.example/aiden-lab/');
      assert.equal(url.protocol, 'https:');
      if (!link.url.startsWith('../')) {
        assert.ok(
          ['github.com', 'pubmed.ncbi.nlm.nih.gov', 'clinicaltrials.gov', 'earthquake.usgs.gov'].includes(url.hostname),
          'Unapproved source host in ' + topic.id
        );
      }
    }
  }
});

test('Aiden is the first-party home for restored Deep Learning build lineage', () => {
  assert.ok(LEARNING_WORLDS.length>=9);
  assert.equal(new Set(LEARNING_WORLDS.map(x=>x.id)).size,LEARNING_WORLDS.length);
  const required=['infinite-classroom','physics-atlas','earth-atlas',
    'cosmos-atlas','energy-atlas','wildlife-atlas','sentinel-intelligence',
    'hidden-world-atlas','deep-learning'];
  for(const id of required)assert.ok(LEARNING_WORLDS.some(x=>x.id===id),id);
  const classroom=LEARNING_WORLDS.find(x=>x.id==='infinite-classroom');
  assert.equal(classroom.state,'practice_preview');
  assert.equal(classroom.url,'./classroom/');
  assert.match(classroom.evidence,/original conversational Luma tutor.*not restored/i);
  for(const world of LEARNING_WORLDS){
    assert.ok(Object.hasOwn(WORLD_STATES,world.state),world.id);
    assert.ok(world.evidence.length>40,world.id);
    assert.ok(world.description.length>40,world.id);
    const u=new URL(world.url,'https://fabric.systemiacommandcenters.com/aiden-lab/');
    assert.equal(u.protocol,'https:');
    if(world.state==='interactive_preview'){
      assert.equal(u.origin,'https://fabric.systemiacommandcenters.com',world.id);
      assert.ok(['./physics/','./world/','./watershed/'].includes(world.url),world.id);
      assert.match(world.evidence,/original|not recovered|not a recovery/i);
    } else if(world.state!=='practice_preview'){
      assert.equal(u.hostname,'github.com',world.id);
      assert.notEqual(world.url,'./classroom/',world.id);
    }
    assert.equal(new URL(world.source).hostname,'github.com');
  }
  assert.equal(LEARNING_SEQUENCE.map(x=>x.title).join(' > '),'Predict > Try it > Observe > Explain > Connect');
  const physics=LEARNING_WORLDS.find(x=>x.id==='physics-atlas');
  const earth=LEARNING_WORLDS.find(x=>x.id==='earth-atlas');
  assert.equal(physics.state,'interactive_preview');
  assert.equal(physics.url,'./physics/');
  assert.equal(earth.state,'interactive_preview');
  assert.equal(earth.url,'./world/');
  const watershed=LEARNING_WORLDS.find(x=>x.id==='watershed-lab');
  assert.equal(watershed.state,'interactive_preview');
  assert.equal(watershed.url,'./watershed/');
  assert.match(watershed.evidence,/not a calibrated real watershed/i);
  const sentinel=LEARNING_WORLDS.find(x=>x.id==='sentinel-intelligence');
  assert.equal(sentinel.state,'historical_rebuild');
  assert.match(sentinel.description,/No live military tracking or tactical controls/);
});

test('Deep Learning campus is a visible, mobile-first first choice, not a claim of a fully restored tutor',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('id="worlds"')>0);
  assert.ok(html.indexOf('id="worlds"')<html.indexOf('id="explore"'));
  assert.match(html,/id="learningWorldGrid"/);
  assert.match(html,/href="\.\/classroom\/"/);
  assert.match(html,/No live AI tutor yet/);
  assert.match(html,/Science atlas/);
  const js=read('app.mjs');
  assert.match(js,/buildLearningWorlds/);
  assert.match(js,/learning-worlds\.mjs/);
  assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|innerHTML\s*=/);
  const css=read('styles.css');
  assert.match(css,/learning-world-grid/);
  assert.match(css,/@media\(max-width:590px\)/);
});

test('Medical research does not claim clinical validation', () => {
  const medical = TOPICS.filter((topic) => topic.category === 'Health & medicine');
  assert.ok(medical.length >= 3);
  for (const topic of medical) {
    assert.match(topic.unknown.toLowerCase(), /not|require|without/);
    assert.equal(topic.state, 'source_code');
  }
});

test('Public shell exposes real navigation and safe, accessible controls', () => {
  const html = read('index.html');
  for (const id of ['explore', 'medical', 'method', 'sources', 'search', 'filters', 'topicGrid', 'savedFilter', 'topicDialog']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /Skip to science atlas/);
  assert.match(html, /No account required/);
  assert.match(html, /not medical advice/i);
  assert.match(html, /script type="module" src="\.\/app\.mjs"/);
  assert.match(read('styles.css'), /prefers-reduced-motion/);
  assert.match(read('mark.svg'), /<svg/);
});

test('Explorer is read-only, privacy-first, and does not depend on third-party runtime', () => {
  const code = read('app.mjs');
  assert.match(code, /localStorage/);
  assert.match(code, /textContent/);
  assert.match(code, /aria-pressed/);
  assert.match(code, /noopener noreferrer/);
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.geolocation|innerHTML\s*=/);
  assert.doesNotMatch(read('index.html'), /base44|firebase|stripe\.com/i);
});
