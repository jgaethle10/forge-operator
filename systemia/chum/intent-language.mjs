const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','being','but','by','can','could','did','do','does','for','from','get','give','had','has','have','help','how','i','if','in','into','is','it','make','me','my','need','of','on','or','our','please','should','that','the','their','them','this','to','use','want','we','what','when','where','which','who','why','will','with','without','would','you','your','not','no','dont'
]);

const CONCEPT_ALIASES = {
  media: ['video','videos','recording','recordings','footage','audio','media','meeting recording','interview recording'],
  overflow: ['too large','very large','huge file','massive file','multi gigabyte','multi-gigabyte','upload limit','upload cap','context limit','context window','too long','multi hour','multi-hour','hours long','cannot upload','cant upload','cannot ingest','cant ingest','rejected by chatbot'],
  transcript: ['transcript','transcription','transcribe','speech to text','speech-to-text'],
  timeline: ['timeline','timestamp','timestamps','timestamped','time coded','time-coded'],
  semantic_search: ['semantic search','search by meaning','searchable by meaning','concept search','rag','retrieval'],
  dedupe: ['dedupe','deduplicate','duplicate segments','repeated footage','overlapping footage','near duplicate','near-duplicate'],
  evidence: ['evidence','source linked','source-linked','provenance','audit trail','receipts'],
  agent_tool: ['ai agent','agent tool','machine client','mcp','api tool','assistant tool'],

  ev: ['ev','electric vehicle','electric vehicles','ev charging','charging station','charging stations','charger','chargers'],
  property: ['property','site','parcel','address','location','commercial property'],
  competition: ['competition','nearby chargers','nearby charging','competitors','existing stations'],
  demand: ['traffic','demand','utilization','sessions','driver demand'],
  tariff: ['tariff','utility rate','demand charge','electric rate','utility'],
  incentive: ['incentive','incentives','rebate','rebates','grant','grants','tax credit'],

  hard_part: ['discontinued part','obsolete part','hard to find part','hard-to-find part','replacement part','machine part','vehicle part','legacy part','unavailable part'],
  salvage: ['salvage','donor','donor unit','used part','junkyard','fabrication','fabricate'],

  website: ['website','web site','site','landing page'],
  conversion: ['conversion','convert','conversions','leads','lead','contacts','contact us','calls','phone calls','inquiries','visitors but no calls','traffic but no leads'],
  seo: ['seo','search visibility','local search','technical seo'],
  performance: ['performance','slow site','page speed','core web vitals'],

  interview: ['interview','job interview','mock interview','interview practice'],
  career: ['career','job search','resume','role specific','role-specific'],

  funding: ['funding','capital','loan','lender','investor','investors','financing','raise money','raising money'],
  readiness: ['readiness','ready for','fit','gaps','qualification','qualify'],

  event: ['event','festival','concert','meetup','venue'],
  promotion: ['promote','promotion','visibility','boost attendance','sell tickets','event discovery'],

  continuity: ['outage','offline','continuity','internet down','network down','disruption','downtime','keep operating'],
  safety: ['identity theft','account takeover','scam','home safety','family safety','business security','personal safety'],
  containment: ['still running','turned off','disabled automation','cron','queue','retry','webhook','respawn','recreate','kill path'],

  enterprise_ops: ['erp','operations','workflow','workflows','disconnected systems','handoff','handoffs','entity resolution','deduplication','modernize'],
  migration: ['vendor lock in','vendor lock-in','migrate','migration','portability','no code','no-code','builder lock in','builder lock-in'],
  social_clip: ['social clip','social clips','vertical clip','vertical clips','short form video','short-form video','reel','reels'],
  social_distribution: ['social media','facebook','linkedin','instagram','social ready','social-ready','publishing path'],
  copy_review: ['copy','headline','caption','post','roast','critique','pressure test'],
  agriculture: ['agriculture','farm','farming','water','land','crop','production','resilience'],
  resources: ['housing','food','benefits','transportation','childcare','legal aid','stability']
};

export function normalizeText(value='') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(token) {
  if (token.length <= 4) return token;
  if (token.endsWith('ies') && token.length > 5) return token.slice(0,-3) + 'y';
  if (token.endsWith('ing') && token.length > 6) return token.slice(0,-3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0,-2);
  if (token.endsWith('es') && token.length > 5) return token.slice(0,-2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0,-1);
  return token;
}

export function tokenize(value='') {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token)=>!STOP_WORDS.has(token) && token.length > 1)
    .map(stem);
}

function phrasePresent(norm, phrase) {
  const p = normalizeText(phrase);
  if (!p) return false;
  if (p.includes(' ')) return (' ' + norm + ' ').includes(' ' + p + ' ');
  return new Set(norm.split(' ')).has(p);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseNegated(norm, phrase) {
  const p = normalizeText(phrase);
  if (!p) return false;
  const escaped = escapeRegExp(p).replace(/\\ /g, '\\s+');
  const negation = '(?:dont\\s+need|do\\s+not\\s+need|dont\\s+want|do\\s+not\\s+want|not\\s+looking\\s+for|not\\s+interested\\s+in|anything\\s+but|except|avoid)';
  const pattern = new RegExp('\\b' + negation + '(?:\\s+[a-z0-9]+){0,1}\\s+' + escaped + '\\b', 'i');
  return pattern.test(norm);
}

function detectConcepts(value='') {
  const norm = normalizeText(value);
  const positive = [];
  const negated = [];
  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
    let strongestPositive = null;
    let strongestNegative = null;
    for (const alias of aliases) {
      if (!phrasePresent(norm, alias)) continue;
      if (phraseNegated(norm, alias)) {
        if (!strongestNegative || normalizeText(alias).split(' ').length > normalizeText(strongestNegative).split(' ').length) strongestNegative = alias;
      } else if (!strongestPositive || normalizeText(alias).split(' ').length > normalizeText(strongestPositive).split(' ').length) {
        strongestPositive = alias;
      }
    }
    if (strongestPositive) positive.push({ concept, evidence: strongestPositive });
    else if (strongestNegative) negated.push({ concept, evidence: strongestNegative });
  }
  return { positive, negated };
}

export function conceptsForText(value='') {
  return detectConcepts(value).positive;
}

export function negatedConceptsForText(value='') {
  return detectConcepts(value).negated;
}

export function intentSignature(value='') {
  const norm = normalizeText(value);
  const tokens = [...new Set(tokenize(norm))];
  const detected = detectConcepts(norm);
  return {
    norm,
    tokens,
    token_set: new Set(tokens),
    concepts: detected.positive,
    concept_set: new Set(detected.positive.map((item)=>item.concept)),
    negated_concepts: detected.negated,
    negated_concept_set: new Set(detected.negated.map((item)=>item.concept))
  };
}

export function compareIntent(query, candidate) {
  const q = typeof query === 'string' ? intentSignature(query) : query;
  const c = typeof candidate === 'string' ? intentSignature(candidate) : candidate;
  if (!q?.norm || !c?.norm) return { score:0, token_overlap:0, concept_overlap:0, phrase_bonus:0, matched_concepts:[], contradicted_concepts:[] };

  let tokenOverlap = 0;
  for (const token of q.token_set) if (c.token_set.has(token)) tokenOverlap += 1;

  const matchedConcepts = [];
  for (const concept of q.concept_set) if (c.concept_set.has(concept)) matchedConcepts.push(concept);

  const contradictedConcepts = [];
  for (const concept of q.negated_concept_set || []) if (c.concept_set.has(concept)) contradictedConcepts.push(concept);

  let phraseBonus = 0;
  if (q.norm.length >= 8 && c.norm.length >= 8 && (q.norm.includes(c.norm) || c.norm.includes(q.norm))) phraseBonus += 24;

  const qBigrams = new Set();
  for (let i=0;i<q.tokens.length-1;i++) qBigrams.add(q.tokens[i] + ' ' + q.tokens[i+1]);
  let bigramOverlap = 0;
  for (let i=0;i<c.tokens.length-1;i++) if (qBigrams.has(c.tokens[i] + ' ' + c.tokens[i+1])) bigramOverlap += 1;

  const score = tokenOverlap * 4 + matchedConcepts.length * 11 + bigramOverlap * 5 + phraseBonus - contradictedConcepts.length * 40;
  return {
    score,
    token_overlap: tokenOverlap,
    concept_overlap: matchedConcepts.length,
    phrase_bonus: phraseBonus,
    bigram_overlap: bigramOverlap,
    matched_concepts: matchedConcepts,
    contradicted_concepts: contradictedConcepts
  };
}
