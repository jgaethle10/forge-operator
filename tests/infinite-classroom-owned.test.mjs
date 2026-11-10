import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANDS, SUBJECTS, LESSONS, lessonsFor, gradeAnswer, nextLesson, progressSummary } from '../public/apps/infinite-classroom/learning-engine.mjs';

test('The owned classroom has every subject at each learning depth', () => {
  assert.deepEqual(BANDS, ['Foundation','Builder','Frontier']);
  assert.deepEqual(SUBJECTS, ['Evidence','Water Science','Systems']);
  assert.equal(LESSONS.length, 9);
  for (const subject of SUBJECTS) {
    assert.equal(lessonsFor({ subject }).length, 3);
    for (const band of BANDS) assert.equal(lessonsFor({subject,band}).length,1);
  }
});

test('All challenges have unique IDs, safe option references and explanatory feedback', () => {
  assert.equal(new Set(LESSONS.map(item => item.id)).size, LESSONS.length);
  for (const lesson of LESSONS) {
    assert.ok(lesson.hint.length > 20);
    assert.ok(lesson.explanation.length > 30);
    assert.equal(lesson.options.length, 3);
    assert.equal(lesson.options.filter(option => option.id === lesson.answer).length, 1);
    assert.deepEqual(gradeAnswer(lesson.id,lesson.answer),{
      correct:true,explanation:lesson.explanation,lessonId:lesson.id
    });
    const wrong = lesson.options.find(option => option.id !== lesson.answer);
    assert.equal(gradeAnswer(lesson.id,wrong.id).correct,false);
  }
  assert.throws(()=>gradeAnswer('unknown','a'),/unknown_lesson/);
  assert.throws(()=>gradeAnswer(LESSONS[0].id,'invalid'),/unknown_option/);
});

test('Progress and recommended next question use completed IDs only', () => {
  assert.deepEqual(progressSummary(['not-real', LESSONS[0].id, LESSONS[0].id]),{completed:1,total:9});
  assert.equal(nextLesson({subject:'Evidence'}).id,'evidence-foundation');
  assert.equal(nextLesson({subject:'Evidence',completedIds:['evidence-foundation']}).id,'evidence-builder');
  assert.equal(nextLesson({subject:'Evidence',completedIds:lessonsFor({subject:'Evidence'}).map(x=>x.id)}),null);
  assert.equal(nextLesson({subject:'Unknown'}),null);
});

test('The prototype is an owned, local-only experience with no provider dependency', () => {
  const html=readFileSync(new URL('../public/apps/infinite-classroom/index.html',import.meta.url),'utf8');
  const engine=readFileSync(new URL('../public/apps/infinite-classroom/learning-engine.mjs',import.meta.url),'utf8');
  assert.match(html,/\.\/learning-engine\.mjs/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/No tracking/);
  assert.doesNotMatch(html + engine, /\bfetch\s*\(|\bXMLHttpRequest\b|\blocalStorage\b|\bsessionStorage\b|https?:\/\/|Core\.InvokeLLM/);
});
