import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('photo stays client local and UI does not claim recognition',()=>{
 const html=fs.readFileSync('public/findmypart/search/index.html','utf8');
 const js=fs.readFileSync('public/findmypart/search/app.mjs','utf8');
 assert.match(html,/id="part-photo"/);
 assert.match(html,/Your photo stays on your device in this preview/);
 assert.match(html,/Image recognition and photo uploads are not active yet/);
 assert.match(js,/URL\.createObjectURL\(file\)/);
 assert.match(js,/not_uploaded:true,not_recognized:true/);
 assert.doesNotMatch(js,/fetch\(.*part-photo|FormData\(/);
});
