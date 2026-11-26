import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/reignite/index.html', import.meta.url),'utf8');
const docs=readFileSync(new URL('../public/reignite/README.md', import.meta.url),'utf8');

test('concept status is unmistakable; no false ticketing, donation or authorization',()=>{
 assert.match(html,/Independent concept preview/);
 assert.match(html,/Not an announced or authorized event/);
 assert.match(html,/No tickets or applications available/);
 assert.match(html,/No confirmed date/);
 assert.match(html,/None of those organizations has approved/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.doesNotMatch(html,/<form\b/);
 assert.doesNotMatch(html,/<button\b/);
 assert.doesNotMatch(html,/stripe\.com|checkout\.|zeffy\.com/i);
});

test('international interest is explicit and conditional, not a visa or booking guarantee',()=>{
 assert.match(html,/Artists around the world/);
 assert.match(html,/outside the United States/);
 assert.match(html,/not accepting applications/);
 assert.match(html,/work authorization/);
 assert.match(html,/mailto:jessegaethle10@gmail.com\?subject=REIGNITE%20creative%20concept%20conversation/);
 assert.match(html,/no applications, promises of payment, confirmed appearances/);
 assert.match(docs,/International acts/);
});

test('music timing claims remain conditional and detailed ordinance review documented',()=>{
 assert.match(html,/Could music continue all night\?/);
 assert.match(html,/cannot promise that/);
 assert.match(docs,/Ordinance No\. 2/);
 assert.match(docs,/12:01 a\.m\./);
 assert.match(docs,/9:00 a\.m\./);
 assert.match(docs,/2 a\.m\./);
 assert.match(docs,/exact parcel\/jurisdiction/);
});

test('nine proposed program options include an unapproved aviation fly-in',()=>{
 for(const text of ['Outdoor main stage','The visual dome','The Quiet Wing',
 'Take the Decks + Karaoke','Art + photography','Heritage + fundraising',
 'Food + community','The history of Hangar B','Pilots for Hangar B']) assert(html.includes(text),text);
 assert.match(html,/Proposed<\/span>/);
 assert.match(html,/Optional concept · not scheduled/);
 assert.match(html,/no aircraft arrival invitations or slots exist/);
 assert.doesNotMatch(html,/fly-in tickets available|book your arrival|guaranteed aircraft parking/i);
});

test('verified museum acquisition and preservation council are accurately linked without implied consent',()=>{
 assert.match(html,/museum reopened on October 29, 2026 under Vintage Aviation Museum/);
 assert.match(html,/Port of Tillamook Bay retained the underlying land/);
 assert.match(html,/Hangar B Preservation Council/);
 assert.match(html,/https:\/\/www\.tillamookair\.com\/new-page-2/);
 assert.match(html,/https:\/\/www\.vintageaviationmuseum\.org\//);
 assert.match(html,/None of those organizations has approved/);
});

test('fully owned, no hidden marketing capture or third-party dependencies',()=>{
 assert.doesNotMatch(html,/<script\b|<iframe\b|<link\b[^>]*rel="stylesheet"|<img\b/i);
 assert.doesNotMatch(html,/\bfetch\(|XMLHttpRequest|localStorage|document\.cookie/i);
 assert.doesNotMatch(html,/google-analytics|googletagmanager|facebook\.com\/tr|base44/i);
 assert.match(html,/The site uses no tracking scripts/);
});

test('accessible structure with working in-page navigation targets',()=>{
 assert.match(html,/<html lang="en">/);
 assert.match(html,/name="viewport"/);
 assert.match(html,/class="skip" href="#main"/);
 assert.match(html,/id="main"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/:focus-visible/);
 assert.match(html,/role="status"/);
 const ids=new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
 for(const href of html.matchAll(/href="#([^"]+)"/g)) assert(ids.has(href[1]),'missing destination '+href[1]);
 assert.equal(ids.size,[...html.matchAll(/\sid="([^"]+)"/g)].length,'duplicate ids');
});

test('links to only vetted history and law sources, not invented site ownership',()=>{
 assert.match(html,/https:\/\/www\.tillamookair\.com\/hangar-b\//);
 assert.match(html,/https:\/\/commons\.wikimedia\.org\/wiki\/File:Tillamook_Air_Museum_from_air\.jpg/);
 assert.match(html,/Tedder \(2022\), CC BY-SA 4\.0/);
 assert.match(docs,/https:\/\/www\.tillamooksheriff\.com\/DocumentCenter\/View\/8256\/Ordinance-2/);
 assert.match(docs,/https:\/\/codelibrary\.amlegal\.com\/codes\/tillamookor/);
});
