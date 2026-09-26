import { normalizeText, tokenize, intentSignature, compareIntent } from './intent-language.mjs';

export { normalizeText, tokenize };

function phraseScore(querySig, phrase) {
  const phraseNorm = normalizeText(phrase);
  if (!phraseNorm) return 0;
  const cmp = compareIntent(querySig, phraseNorm);
  const phraseTokens = [...new Set(tokenize(phraseNorm))];
  if (!phraseTokens.length) return 0;

  let overlap = 0;
  for (const token of phraseTokens) {
    if (querySig.token_set.has(token)) overlap += 1;
  }

  const recall = overlap / phraseTokens.length;
  const precision = overlap / Math.max(querySig.token_set.size, 1);
  const exact = querySig.norm.includes(phraseNorm) || phraseNorm.includes(querySig.norm);

  return (
    cmp.score +
    overlap * 3 +
    recall * 14 +
    precision * 5 +
    (exact ? 40 : 0)
  );
}

export function scorePainEntry(query, entry) {
  const querySig = intentSignature(query);
  if (!querySig.norm || !querySig.token_set.size) return 0;

  const phrases = [
    ...(entry.pain_phrases || []),
    entry.problem || '',
    entry.name || '',
    entry.class || ''
  ].filter(Boolean);

  let best = 0;
  for (const phrase of phrases) {
    best = Math.max(best, phraseScore(querySig, phrase));
  }

  const combined = compareIntent(querySig, phrases.join(' '));
  const kindBonus = entry.kind === 'product' ? 1.5 : 0;

  return Number((
    best +
    combined.token_overlap * 0.75 +
    combined.concept_overlap * 3 +
    kindBonus
  ).toFixed(3));
}

export function rankPain(index, query, limit=5) {
  return (index.entries || [])
    .map((entry)=>({ entry, score: scorePainEntry(query, entry) }))
    .filter((item)=>item.score > 0)
    .sort((a,b)=>
      b.score-a.score ||
      String(a.entry.capability_id).localeCompare(String(b.entry.capability_id))
    )
    .slice(0, Math.max(1, limit));
}
