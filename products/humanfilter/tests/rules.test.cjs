const test = require('node:test');
const assert = require('node:assert/strict');
require('../extension/rules.js');
const { DEFAULTS, classify } = global.HumanFilterRules;
const make = (text, site='reddit', extra = {}) => classify({text, site, labels: extra.labels || []}, {...DEFAULTS, ...extra});

test('direct human declaration filters', () => {
  assert.equal(make('I made this with AI today').kind, 'declared');
  assert.equal(make('Made using Midjourney', 'reddit').kind, 'declared');
});
test('recognized label filters', () => {
  assert.equal(make('sunset video', 'youtube', {labels:['Made with AI']}).kind, 'declared');
});
test('AI discussion is not filtered in Balanced mode', () => {
  assert.equal(make('Someone should build an extension that blocks all AI content'), null);
  assert.equal(make('AI art is an interesting copyright debate'), null);
  assert.equal(make('I watched a human explain artificial intelligence'), null);
});
test('Strict filters AI topics but not every post', () => {
  assert.equal(make('We discussed ChatGPT', 'reddit', {mode:'strict'}).kind, 'topic');
  assert.equal(make('What a nice day!', 'reddit', {mode:'strict'}), null);
});
test('turning site or filtering off means no matches', () => {
  assert.equal(make('I made this with AI', 'reddit', {enabled:false}),null);
  assert.equal(make('I made this with AI', 'reddit', {sites:{...DEFAULTS.sites,reddit:false}}),null);
});
test('custom keywords match case-insensitively', () => {
  assert.equal(make('More SPONSORED nonsense', 'facebook', {customKeywords:['Sponsored']}).kind,'keyword');
});
test('malicious regex-looking keywords are literal, not executable', () => {
  assert.equal(make('Hello world', 'facebook', {customKeywords:['(a+)+$']}), null);
});
