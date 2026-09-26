import crypto from 'node:crypto';

const raw = process.argv[2] || process.env.PUBLIC_BASE_URL || process.env.CHUM_PUBLIC_ORIGIN || '';
if (!raw) {
  console.error('Usage: npm run verify:public-origin -- https://your-origin.example');
  process.exit(2);
}

const origin = new URL(raw).origin;

async function expectOk(path, init) {
  const response = await fetch(origin + path, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return { response, text };
}

const healthResult = await expectOk('/api/health');
const health = JSON.parse(healthResult.text);
if (health.ok !== true || health.service !== 'forge-operator') {
  throw new Error('Unexpected health payload.');
}

const fallen = await expectOk('/fallen');
if (!fallen.text.includes('<div id="root"></div>')) {
  throw new Error('/fallen did not return the production SPA shell.');
}

const episodeResult = await expectOk('/api/fallen/family/episode', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    seriesTitle: 'Public Origin Canary',
    episodeTitle: 'The Blanket Fort',
    premise: 'The family builds a blanket fort while the dog keeps stealing the pillows.',
    style: 'Warm 2D storybook cartoon',
    characters: [
      { id: 'parent', name: 'Parent', role: 'Parent', description: 'Warm and funny.' },
      { id: 'kid', name: 'Kid', role: 'Kid', description: 'Curious and energetic.' }
    ]
  })
});
const episode = JSON.parse(episodeResult.text);
if (episode.success !== true) throw new Error('Fallen episode canary failed.');
if (episode.data?.story?.scenes?.length !== 6) throw new Error('Fallen episode canary did not return six scenes.');
if (episode.data?.seriesPlan?.schema !== 'evercraft.fallen.series-plan.v1') {
  throw new Error('Fallen series plan contract missing.');
}
if (episode.data?.seriesPlan?.continuity?.status !== 'pass') {
  throw new Error('Fallen continuity canary failed.');
}

const robots = await expectOk('/robots.txt');
if (!robots.text.includes(origin + '/sitemap.xml')) {
  throw new Error('robots.txt does not advertise the verified public origin.');
}

const receipt = {
  schema: 'evercraft.public-origin-receipt.v1',
  origin,
  verified: true,
  checks: {
    health: true,
    fallen_spa: true,
    fallen_episode: true,
    continuity: true,
    robots_absolute_sitemap: true
  },
  episode_canon_receipt: episode.data.seriesPlan.canonReceipt,
  verified_at: new Date().toISOString()
};
receipt.receipt_hash = crypto
  .createHash('sha256')
  .update(JSON.stringify(receipt))
  .digest('hex');

console.log(JSON.stringify(receipt, null, 2));
