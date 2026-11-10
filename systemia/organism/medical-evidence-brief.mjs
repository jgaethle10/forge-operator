// Evercraft-owned biomedical evidence radar: metadata-first, no clinical claims.
// Consumes the existing KAIDANCE PubMed source receipt and emits standalone visuals.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const h = (value) => String(value ?? '').replace(/[&<>"']/g, (x) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[x]));
const safePmid = (v) => /^\d{1,12}$/.test(String(v ?? '')) ? String(v) : null;
const topics = [
  ['Oncology', /\b(cancer|oncolog|tumou?r|neoplas|carcinom|leukemi|lymphom)\b/i],
  ['Parkinson and neurology', /\b(parkinson|neurolog|neurodegenerat|alpha.synuclein|lysosom)\b/i],
  ['Pregnancy and maternal health', /\b(pregnan|maternal|gestation|prenatal|obstetric)\b/i],
  ['Genomics', /\b(genom|genetic|gene edit|dna|rna)\b/i],
  ['Public and planetary health', /\b(public health|epidemiol|one health|zoonot|climate|pandemic)\b/i],
];
const topicFor = (title) => topics.find(([, re]) => re.test(String(title ?? '')))?.[0] || 'Other biomedical research';
const sortLabels = [...topics.map(([label]) => label), 'Other biomedical research'];
const compact = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 340);

export function buildMedicalEvidenceBrief(watch, { now = new Date() } = {}) {
  const medical = watch?.lanes?.medical_research;
  const hasSource = medical?.status === 'observed' && medical?.source &&
    Array.isArray(medical?.documents);
  const seen = new Set();
  const documents = [];
  for (const row of hasSource ? medical.documents : []) {
    const pmid = safePmid(row?.pmid);
    if (!pmid || seen.has(pmid)) continue;
    seen.add(pmid);
    const title = compact(row?.title);
    documents.push({
      pmid,
      title: title || 'Untitled PubMed record',
      journal: compact(row?.source) || 'Journal not supplied',
      published: compact(row?.pubdate) || 'Date not supplied',
      authors: Array.isArray(row?.authors) ? row.authors.slice(0, 6).map(compact).filter(Boolean) : [],
      topic: topicFor(title),
      source_url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/'
    });
  }
  const state = hasSource && documents.length ? 'metadata_observed' : 'source_held';
  const counts = Object.fromEntries(sortLabels.map((name) => [name, 0]));
  for (const doc of documents) counts[doc.topic] += 1;
  const body = {
    schema: 'evercraft.medical.evidence-brief.v1',
    generated_at: now.toISOString(),
    observed_at: watch?.observed_at || null,
    status: state,
    source_receipt: watch?.receipt_hash || null,
    source: medical?.source || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
    scope: medical?.query_scope || 'PubMed recent-literature discovery',
    total_recent_matches: state === 'metadata_observed'
      ? Math.max(0, Number(medical.total_recent_matches) || 0) : null,
    sampled_titles: documents.length,
    sampled_title_topics: counts,
    documents,
    evidence_limitations: [
      'Only PubMed search and summary metadata were collected. Full-text methods, results and quality have not been reviewed.',
      'Title keyword groupings show a small sampled reading queue, not disease incidence, treatment efficacy or a trend in scientific discoveries.',
      'Publication date and indexing date may differ. Search scope is broad and is not a systematic review.',
      'No claim of cure, clinical benefit or mechanism is verified by this output.'
    ],
    next_edges: [
      'Retrieve abstracts and persistent identifiers with a bounded, source-linked extractor.',
      'Compare preprints, peer-reviewed studies, retractions and clinical trial registry status before making claims.',
      'Have independent scientific review and adversarial QA check any proposed Journal article.'
    ],
    publication_disposition: 'held_with_reason',
    publication_hold: state === 'source_held'
      ? 'PubMed query or document summaries unavailable. No evidence story may be published.'
      : 'Metadata-only scan: clinical claims and Journal distribution require independent article-level review.',
    privacy: 'public_biomedical_metadata_only; no patient records or personal health data'
  };
  return { ...body, receipt_hash: sha256(JSON.stringify(body)) };
}

export function renderMedicalEvidenceSVG(brief) {
  const entries = Object.entries(brief.sampled_title_topics);
  const max = Math.max(1, ...entries.map(([,n]) => n));
  const height = 144 + entries.length * 44;
  const bars = entries.map(([label,count],i) => {
    const y = 102+i*44, width = Math.round((count/max)*355);
    return '<text x="28" y="' + (y-7) + '" class="label">' + h(label) + '</text>' +
      '<rect x="28" y="' + y + '" width="355" height="13" rx="6.5" fill="#23344c"/>' +
      '<rect x="28" y="' + y + '" width="' + width + '" height="13" rx="6.5" fill="#62d8fc"/>' +
      '<text x="397" y="' + (y+11) + '" class="count">' + count + '</text>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 ' + height + '" role="img" aria-label="Topic counts among ' + brief.sampled_titles + ' sampled PubMed titles">' +
    '<style>text{font-family:Arial,Helvetica,sans-serif}.label{fill:#e5f2ff;font-size:13px}.count{fill:#7fe8ff;font-size:16px;font-weight:700}.small{fill:#83a9c8;font-size:12px}.head{fill:#fff;font-size:24px;font-weight:700}</style>' +
    '<rect width="520" height="' + height + '" rx="22" fill="#0b1426"/>' +
    '<text x="28" y="42" class="head">THE RESEARCH RADAR</text>' +
    '<text x="28" y="65" class="small">Sampled PubMed title categories  /  Not clinical outcomes</text>' +
    bars + '</svg>';
}

export function renderMedicalEvidenceMarkdown(brief) {
  const lines = [
    '# Evercraft | Biomedical Evidence Radar',
    '',
    '**Evidence status:** ' + brief.status,
    '**Observed:** ' + (brief.observed_at || 'Unavailable'),
    '**Source receipt:** ' + (brief.source_receipt || 'Unavailable'),
    '**Recent matches in search scope:** ' + (brief.total_recent_matches ?? 'Unavailable'),
    '**Sampled article titles:** ' + brief.sampled_titles,
    '**Journal disposition:** HELD',
    '',
    '## What this is',
    'An automated reading queue and visualization of PubMed title metadata, **not** a validated medical breakthrough report.',
    '',
    '## Sampled title categories',
    ...Object.entries(brief.sampled_title_topics).map(([label,count]) => '- ' + label + ': ' + count),
    '',
    '## Source-linked reading queue',
    ...brief.documents.map((d) => '- [' + d.title.replace(/[\[\]]/g,'') + '](' + d.source_url + ') | ' + d.journal + ' | ' + d.published + ' | PMID ' + d.pmid),
    '',
    '## What we cannot conclude',
    ...brief.evidence_limitations.map((s) => '- ' + s),
    '',
    '## Next verified research steps',
    ...brief.next_edges.map((s) => '- ' + s),
    '',
    '**Publication hold:** ' + brief.publication_hold,
    '',
    'This report contains public research metadata only and is not medical advice.'
  ];
  return lines.join('\n') + '\n';
}

export function renderMedicalEvidenceHTML(brief, svg) {
  const cards = brief.documents.map((doc,i) =>
    '<article class="paper"><div class="paper-meta"><span>PMID ' + doc.pmid +
    '</span><span>' + h(doc.topic) + '</span></div>' +
    '<h3><a href="' + doc.source_url + '" target="_blank" rel="noopener noreferrer">' +
    h(doc.title) + '</a></h3><div class="paper-foot">' + h(doc.journal) +
    ' <span class="sep">/</span> ' + h(doc.published) + '</div></article>'
  ).join('');
  const css = [
    ':root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;background:#07101e;color:#edf7ff}',
    '*{box-sizing:border-box}body{margin:0}a{color:inherit}a:hover{color:#7be5ff}',
    '.shell{max-width:1180px;margin:auto;padding:28px 30px 90px}',
    '.mast{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:62px}',
    '.logo{font-weight:900;letter-spacing:.20em;font-size:13px}.edition{font-size:11px;letter-spacing:.12em;color:#87a4c4}',
    '.eyebrow{color:#70dfff;letter-spacing:.24em;font-size:12px;font-weight:800;text-transform:uppercase}',
    '.hero{position:relative;overflow:hidden;border:1px solid #2a4562;border-radius:28px;padding:56px 54px 45px;background:radial-gradient(circle at 90% 10%,#1e5671 0,transparent 37%),linear-gradient(135deg,#102640,#0a1426 68%)}',
    'h1{font-size:clamp(44px,7vw,91px);line-height:.99;max-width:780px;letter-spacing:-.065em;margin:22px 0}',
    '.intro{font-size:18px;line-height:1.6;max-width:650px;color:#b6cee3}',
    '.pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:31px}.pill{border:1px solid #56728d;border-radius:30px;padding:9px 14px;font-size:12px;font-weight:650;color:#d5edff}',
    '.pill.hold{border-color:#c7a477;color:#ffddac}',
    '.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;margin-top:20px}',
    '.stat{padding:24px;background:#101f32;border:1px solid #263f5c;border-radius:17px}',
    '.value{font-size:42px;font-weight:800;letter-spacing:-.07em}.metric-label{font-size:12px;line-height:1.5;color:#9fb9d1;margin-top:8px;text-transform:uppercase;letter-spacing:.07em}',
    '.cols{display:grid;grid-template-columns:1.05fr .95fr;gap:22px;margin-top:50px}',
    'h2{font-size:28px;letter-spacing:-.04em;margin:0 0 15px}.note{color:#a3bdd5;font-size:14px;line-height:1.7}',
    '.visual{width:100%;height:auto;display:block;border-radius:21px}',
    '.panel{border:1px solid #2a405b;background:#0d1b2e;border-radius:21px;padding:28px}',
    '.panel ol,.panel ul{padding-left:22px;line-height:1.8;color:#bfcee0}.panel li{margin:9px 0}',
    '.papers{margin-top:55px}.papers-head{display:flex;justify-content:space-between;gap:16px;align-items:end}',
    '.paper-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}',
    '.paper{border:1px solid #294059;background:#0d1b2e;border-radius:18px;padding:22px;min-height:165px}',
    '.paper-meta{display:flex;justify-content:space-between;gap:8px;color:#62d8fc;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}',
    '.paper h3{font-size:17px;line-height:1.4;margin:14px 0 22px}.paper h3 a{text-decoration:none}.paper-foot{color:#91afc8;font-size:12px}.sep{margin:0 5px;color:#42617c}',
    '.foot{border-top:1px solid #294059;margin-top:60px;padding-top:25px;color:#8ba7c0;font-size:12px;line-height:1.8}',
    '@media(max-width:760px){.shell{padding:20px 15px 65px}.mast{margin-bottom:30px}.hero{padding:37px 24px}.stats,.cols,.paper-grid{grid-template-columns:1fr}.value{font-size:36px}.papers-head{display:block}.panel{padding:20px}}',
    '@media print{:root{color-scheme:light}body{background:white;color:black}.hero,.stat,.panel,.paper{color:#111;background:#f3f7fb;border-color:#d0dce5}.intro,.note,.metric-label,.paper-foot,.foot{color:#344b60}.pills .pill{color:#111;border-color:#888}a{color:#064d74}.paper{break-inside:avoid}.shell{padding:12px}.hero{padding:28px}.cols{display:block}.visual{max-width:490px}.stats{display:flex}.stat{flex:1}}'
  ].join('\n');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>Evercraft | Biomedical Evidence Radar</title><style>' + css + '</style></head><body>' +
    '<main class="shell"><header class="mast"><div class="logo">EVERCRAFT <span style="color:#66deff">/</span> RESEARCH</div>' +
    '<div class="edition">MEDICAL DISCOVERY LAB · SOURCE-BOUND EDITION</div></header>' +
    '<section class="hero"><div class="eyebrow">AUTONOMOUS SIGNAL COLLECTION / EDITION 001</div>' +
    '<h1>Discover the signal.<br/>Prove the science.</h1>' +
    '<p class="intro">A window into newly indexed biomedical research. Every title is linked to a public record. No title is mistaken for a cure, confirmed clinical effect, or validated breakthrough.</p>' +
    '<div class="pills"><span class="pill">PUBMED METADATA</span><span class="pill">CITATION-BOUND</span>' +
    '<span class="pill hold">JOURNAL PUBLICATION HELD</span></div></section>' +
    '<section class="stats"><div class="stat"><div class="value">' + (brief.total_recent_matches ?? '—') +
    '</div><div class="metric-label">Recent search matches<br/>within defined query scope</div></div>' +
    '<div class="stat"><div class="value">' + brief.sampled_titles + '</div><div class="metric-label">Titles in this<br/>bounded reading queue</div></div>' +
    '<div class="stat"><div class="value">' + Object.values(brief.sampled_title_topics).filter(Boolean).length +
    '</div><div class="metric-label">Title-level topic groups<br/>not clinical outcomes</div></div></section>' +
    '<section class="cols"><div><h2>The evidence landscape</h2><p class="note">Topic assignments come from title keywords only. Counts reflect the sampled reading queue, not prevalence, therapeutic efficacy, or the wider body of science.</p>' +
    svg.replace('<svg ', '<svg class="visual" ') + '</div>' +
    '<div class="panel"><div class="eyebrow">STATUS / ' + h(brief.status).toUpperCase() + '</div>' +
    '<h2 style="margin-top:14px">The scientific firewall</h2>' +
    '<p class="note">' + h(brief.publication_hold) + '</p>' +
    '<h3>What this cannot prove</h3><ul>' + brief.evidence_limitations.map((s) => '<li>' + h(s) + '</li>').join('') +
    '</ul><h3>Next research advances</h3><ol>' +
    brief.next_edges.map((s) => '<li>' + h(s) + '</li>').join('') + '</ol></div></section>' +
    '<section class="papers"><div class="papers-head"><h2>The source-linked reading queue</h2><span class="note">' +
    brief.sampled_titles + ' indexed citations · article-level review pending</span></div>' +
    '<div class="paper-grid">' + (cards || '<p class="note">Source unavailable. This scan is held; no papers can be inferred.</p>') +
    '</div></section><footer class="foot">Observed ' + h(brief.observed_at || 'unknown') +
    ' · SHA-256 source receipt ' + h(brief.source_receipt || 'not supplied') +
    '<br/>Public biomedical metadata only. No patient records. No diagnosis, treatment recommendations, cure claims, or verified Journal publication.</footer></main></body></html>';
}

export function writeMedicalEvidenceBrief({
  watch,
  now = new Date(),
  outDir = path.join(process.cwd(), 'artifacts/medical-evidence-radar')
}) {
  const brief = buildMedicalEvidenceBrief(watch, { now });
  const svg = renderMedicalEvidenceSVG(brief);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(brief, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'report.md'), renderMedicalEvidenceMarkdown(brief));
  fs.writeFileSync(path.join(outDir, 'research-radar.svg'), svg + '\n');
  fs.writeFileSync(path.join(outDir, 'index.html'), renderMedicalEvidenceHTML(brief, svg));
  return brief;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const input = process.argv[2] || 'artifacts/science-hazard-watch/latest.json';
  const outDir = process.argv[3] || 'artifacts/medical-evidence-radar';
  const watch = JSON.parse(fs.readFileSync(input, 'utf8'));
  const brief = writeMedicalEvidenceBrief({ watch, outDir });
  console.log(JSON.stringify({
    status: brief.status, sampled_titles: brief.sampled_titles,
    publication_disposition: brief.publication_disposition,
    receipt_hash: brief.receipt_hash
  }));
}
