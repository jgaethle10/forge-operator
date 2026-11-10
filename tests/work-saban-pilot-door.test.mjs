import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../public/work-saban/index.html',import.meta.url),'utf8');

test('customer journey stays simple and focused on one genuine action',()=>{
  for(const phrase of ['Work Saban','Give your work','a team.','Join the private pilot',
    'One task. Three simple steps.','THE FIRST USE CASE','PRIVATE PILOT INTEREST',
    'Request the private pilot by email','No calls required']) assert.ok(html.includes(phrase),'missing: '+phrase);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/jgaethle10\.github\.io\/forge-operator\/work-saban\/">/);
  assert.match(html, /mailto:jessegaethle10@gmail.com\?subject=Work%20Saban%20private%20reporting%20pilot/);
  assert.ok(html.length < 18000,'public site became too complicated again');
});

test('customer page does not fabricate a working cloud service or payment',()=>{
  for(const phrase of ['Illustrative preview, not live customer execution.',
  'No payment at inquiry.', 'Please send no confidential files',
  'An inquiry is not an order, charge, acceptance, or guarantee of availability.',
  'There is no CSV upload to Evercraft', 'There is no checkout for expanded Work Saban services',
  'five registered local deterministic worker stages']) assert.ok(html.includes(phrase),'missing truth boundary: '+phrase);
  assert.doesNotMatch(html, /<form\b|<input\b|<script\b|buy\.stripe\.com/i);
  assert.match(html,/No external account action or payment is initiated from this page/);
  assert.match(html,/href="\.\/report\/">Make your sales report<\/a>/);
});

test('simple brand is predominantly white, crimson and black',()=>{
  for(const color of ['#fff','#a4142f','#171717','#f8f8f7']) assert.ok(html.toLowerCase().includes(color),'missing '+color);
  assert.match(html,/@media\(max-width:600px\)/);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
});
