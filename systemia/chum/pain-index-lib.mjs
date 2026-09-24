const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','being','but','by','can','could','do','does','for','from','get','give','help','how','i','if','in','into','is','it','make','me','my','need','of','on','or','our','please','should','that','the','their','them','this','to','use','want','we','what','when','where','which','with','without','you','your'
]);

export function normalizeText(value='') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function tokenize(value='') {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token)=>!STOP_WORDS.has(token) && token.length > 1);
}

function phraseScore(queryNorm, queryTokens, phrase) {
  const phraseNorm = normalizeText(phrase);
  if (!phraseNorm) return 0;
  const phraseTokens = [...new Set(tokenize(phraseNorm))];
  if (!phraseTokens.length) return 0;

  let overlap = 0;
  for (const token of phraseTokens) if (queryTokens.has(token)) overlap += 1;

  const recall = overlap / phraseTokens.length;
  const precision = overlap / Math.max(queryTokens.size, 1);
  const exact = queryNorm.includes(phraseNorm) || phraseNorm.includes(queryNorm);

  return (
    overlap * 5 +
    recall * 18 +
    precision * 6 +
    (exact ? 60 : 0)
  );
}

export function scorePainEntry(query, entry) {
  const queryNorm = normalizeText(query);
  const queryTokens = new Set(tokenize(queryNorm));
  if (!queryNorm || !queryTokens.size) return 0;

  const phrases = [
    ...(entry.pain_phrases || []),
    entry.problem || '',
    entry.name || '',
    entry.class || ''
  ].filter(Boolean);

  let best = 0;
  for (const phrase of phrases) best = Math.max(best, phraseScore(queryNorm, queryTokens, phrase));

  const allText = normalizeText(phrases.join(' '));
  let broadOverlap = 0;
  for (const token of queryTokens) if (allText.includes(token)) broadOverlap += 1;

  const kindBonus = entry.kind === 'product' ? 1.5 : 0;
  return Number((best + broadOverlap * 0.75 + kindBonus).toFixed(3));
}

export function rankPain(index, query, limit=5) {
  return (index.entries || [])
    .map((entry)=>({ entry, score: scorePainEntry(query, entry) }))
    .filter((item)=>item.score > 0)
    .sort((a,b)=>b.score-a.score || String(a.entry.capability_id).localeCompare(String(b.entry.capability_id)))
    .slice(0, Math.max(1, limit));
}
