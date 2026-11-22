import assert from 'node:assert/strict';
import test from 'node:test';
import { renderJournalArchivePage, renderJournalAboutPage } from './journal-reader-pages.mjs';

const origin='https://journal.test.evercraft.local';
const row={slug:'published-report',title:'A real report',dek:'Verified details and context.',desk:'Science',published_at:'2026-11-21T19:00:00.000Z'};

test('searchable archive shows only supplied approved records with accurate states',()=>{
  const html=renderJournalArchivePage([row],[{...row,slug:'archived-report',title:'Older report',published_at:'2026-10-11T19:00:00.000Z'}],origin);
  assert.match(html,/href="\.\.\/published-report\/"/);
  assert.match(html,/href="\.\.\/archived-report\/"/);
  assert.match(html,/Archived does not mean current/);
  assert.match(html,/Historical edition. Not a live update/);
  assert.match(html,/id="journal-search"/);
  assert.match(html,/id="journal-desk"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/No matching stories in the published record/);
  assert.match(html,/href="https:\/\/journal\.test\.evercraft\.local\/archive\/" /);
  assert.equal((html.match(/\sdata-journal-entry(?=\s|>)/g)||[]).length,2);
});
test('archive-only and empty result rendering does not claim current articles',()=>{
  const html=renderJournalArchivePage([], [row], origin);
  assert.match(html,/<strong>0<\/strong> current/);
  assert.match(html,/<strong>1<\/strong> archived/);
  assert.doesNotMatch(html,/Current edition/);
  const empty=renderJournalArchivePage([],[],origin);
  assert.match(empty,/<strong>0<\/strong> approved stories in the record/);
  assert.equal((empty.match(/\sdata-journal-entry(?=\s|>)/g)||[]).length,0);
});
test('titles, desk names and descriptions cannot inject executable markup',()=>{
  const html=renderJournalArchivePage([{...row,title:'<script>alert(1)</script>',desk:'<img src=x>',dek:'"dangerous" & <bad>'}],[],origin);
  assert.doesNotMatch(html,/<script>alert/);
  assert.match(html,/&lt;script&gt;alert/);
  assert.match(html,/&lt;img src=x&gt;/);
  assert.match(html,/&quot;dangerous&quot; &amp; &lt;bad&gt;/);
});
test('reader standards page explains publication, photo and uncertainty boundaries',()=>{
  const html=renderJournalAboutPage(origin);
  assert.match(html,/Curiosity deserves evidence/);
  assert.match(html,/Separate reporting from distribution/);
  assert.match(html,/Article.*?not/);
  assert.match(html,/href="https:\/\/journal\.test\.evercraft\.local\/about\/" /);
  assert.match(html,/href="\.\.\/archive\/"/);
});
