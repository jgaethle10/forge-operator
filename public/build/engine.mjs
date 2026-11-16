// Evercraft Build alpha: deterministic, browser-only concept-to-static-preview engine.
// This is not model inference, a hosted build job, a payment rail, or deployment authority.
export const MAX_PROMPT_LENGTH = 1500;
export const ALLOWED_KINDS = Object.freeze(['website', 'landing', 'app', 'automation']);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function clean(value, limit) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function categoryFor(prompt) {
  const options = [
    ['Landscaping', /\b(landscap|lawn|garden|yard)\w*/i, 'Thoughtful spaces, better days.', 'Request an estimate'],
    ['Cleaning', /\b(clean|maid|housekeep)\w*/i, 'Make room for what matters.', 'Explore services'],
    ['Restaurant', /\b(restaurant|cafe|bakery|coffee|food)\b/i, 'Something good is taking shape.', 'Explore the menu'],
    ['Home Services', /\b(plumb|hvac|roof|electrician|contractor|repair)\w*/i, 'Reliable work starts with a conversation.', 'Explore services'],
    ['Fitness', /\b(fitness|gym|trainer|yoga|wellness)\b/i, 'Build your next chapter.', 'Explore programs'],
    ['Education', /\b(tutor|teach|lesson|education|school)\w*/i, 'A better way to grow.', 'Explore programs'],
  ];
  return options.find((entry) => entry[1].test(prompt)) || ['Independent Business', /.*/, 'Made for what comes next.', 'Get in touch'];
}

export function analyzePrompt({ prompt, kind = 'website', brand = '' } = {}) {
  const original = String(prompt ?? '').trim();
  if (original.length < 12) throw new Error('Describe what you want to build in at least 12 characters.');
  if (original.length > MAX_PROMPT_LENGTH) throw new Error('Please shorten your idea to 1,500 characters.');
  if (!ALLOWED_KINDS.includes(kind)) throw new Error('Choose a supported project category.');
  const name = clean(brand, 60) || 'Your Business';
  const [category, , headline, action] = categoryFor(original);
  const requested = [
    [/book|appointment|reserv/i, 'Appointment scheduling'],
    [/estim|quot|pricing/i, 'Estimate requests'],
    [/shop|store|ecommerce|checkout|sell online/i, 'Online purchasing'],
    [/login|account|member|dashboard/i, 'Customer accounts'],
    [/map|location/i, 'Location information'],
    [/gallery|portfolio|photos/i, 'Project gallery'],
  ].filter(([pattern]) => pattern.test(original)).map(([, value]) => value);
  const kindName = {website:'Website',landing:'Landing page',app:'Web application',automation:'Automation'}[kind];
  const previewSupported = kind === 'website' || kind === 'landing';
  const deliverable = previewSupported
    ? 'Single-file, static, responsive HTML concept. No live backend, account, booking, payment, or form delivery.'
    : 'Scoped planning brief only. Executable app/automation generation is not connected to this alpha.';
  const warnings = [
    'No client project is submitted or stored on Evercraft servers.',
    'No payment is requested or processed.',
    'No public website is deployed or domain configured.',
    'Requested backend features are listed as requirements, not implemented.',
  ];
  return {
    schema: 'evercraft.build.brief.v1',
    state: 'local_preview_only',
    kind,
    kind_name: kindName,
    brand: name,
    category,
    headline,
    action,
    original_prompt: original,
    requested_features: requested,
    preview_supported: previewSupported,
    deliverable,
    warnings,
    next_steps: previewSupported
      ? ['Review this concept', 'Confirm real copy and branding', 'Connect authorized backend services', 'Test and approve before deployment']
      : ['Confirm workflows and data requirements', 'Review permissions and integrations', 'Design an isolated build worker', 'Test a preview before any deployment'],
  };
}

export function renderWebsite(brief) {
  if (!brief || brief.state !== 'local_preview_only' || !brief.preview_supported) {
    throw new Error('Static preview is available only for website and landing-page briefs.');
  }
  const title = escapeHtml(brief.brand);
  const category = escapeHtml(brief.category);
  const headline = escapeHtml(brief.headline);
  const action = escapeHtml(brief.action);
  const requested = brief.requested_features.length
    ? brief.requested_features.map((feature) => '<li>' + escapeHtml(feature) + ' <span>planned, not connected</span></li>').join('')
    : '<li>Clear service information <span>concept only</span></li>';
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<title>' + title + ' | Website Concept</title>',
    '<style>*{box-sizing:border-box}body{margin:0;font:16px/1.65 system-ui,Arial,sans-serif;color:#182921;background:#fafbf8}',
    'header{display:flex;justify-content:space-between;align-items:center;padding:22px clamp(20px,5vw,80px);background:white;border-bottom:1px solid #e2e9e1}',
    'header strong{font-size:1.15rem;letter-spacing:-.045em}header span{font-size:.75rem;color:#5c7869;letter-spacing:.12em;text-transform:uppercase}',
    '.hero{padding:clamp(70px,12vw,150px) clamp(24px,8vw,120px);background:radial-gradient(circle at 83% 12%,#cbe8d8,transparent 43%),#eaf4ec}',
    '.eyebrow{letter-spacing:.18em;text-transform:uppercase;font-size:.77rem;font-weight:800;color:#2e704d}',
    'h1{font-size:clamp(2.6rem,6vw,5.4rem);letter-spacing:-.065em;line-height:1.08;max-width:820px;margin:18px 0}',
    '.hero p{font-size:1.12rem;color:#375447;max-width:620px}a.button{display:inline-block;margin-top:20px;background:#1e5136;color:white;text-decoration:none;border-radius:10px;padding:14px 20px;font-weight:800}',
    '.content{padding:64px clamp(24px,8vw,120px);max-width:1100px;margin:auto}.content h2{font-size:2rem;letter-spacing:-.05em}',
    'ul{padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:12px}li{background:white;border:1px solid #dfe7df;border-radius:12px;padding:18px;font-weight:700}',
    'li span{display:block;color:#637b6c;font-weight:400;font-size:.79rem;margin-top:6px}',
    '#contact{background:#173a29;color:white;padding:55px clamp(24px,8vw,120px)}#contact p{max-width:650px;color:#d2e6da}',
    'footer{padding:22px clamp(24px,8vw,120px);font-size:.8rem;color:#698073}',
    '</style></head><body>',
    '<header><strong>' + title + '</strong><span>' + category + '</span></header>',
    '<main><section class="hero"><div class="eyebrow">Made for your next chapter</div><h1>' + headline + '</h1>',
    '<p>Meet ' + title + '. A fresh starting point for customers to understand what you do and how to get started.</p>',
    '<a class="button" href="#contact">' + action + '</a></section>',
    '<section class="content"><h2>Built around your business</h2><p>Areas requested in your build brief:</p><ul>' + requested + '</ul></section>',
    '<section id="contact"><h2>Start a conversation</h2><p>This is a design concept. Add verified contact details, an authorized intake system, and your own business copy before publishing.</p></section></main>',
    '<footer>Website concept generated locally with Evercraft Build alpha. Not a launched customer site.</footer>',
    '</body></html>',
  ].join('');
}
