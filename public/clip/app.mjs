// Local-only Clip prep. No tokens, requests, platform submissions or publication claims.
const caption = document.querySelector('#caption');
const channel = document.querySelector('#channel');
const mediaInput = document.querySelector('#media');
const status = document.querySelector('#message');
const previews = document.querySelector('#previews');
const count = document.querySelector('#count');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg','image/png','image/webp']);
let urls = [];

function announce(message) { status.textContent = message; }
function getFiles() {
  const files = Array.from(mediaInput.files || []);
  if (files.length > 2) throw new Error('Choose no more than two images.');
  for (const file of files) {
    if (!allowedTypes.has(file.type) || file.size > MAX_FILE_BYTES) {
      throw new Error('Use JPEG, PNG or WebP images under 8 MB each.');
    }
  }
  return files;
}
function getDraft() {
  const text = caption.value.trim();
  if (!text) throw new Error('Add a caption first.');
  if (text.length > 15000) throw new Error('Caption is too long.');
  const files = getFiles();
  if ((channel.value === 'instagram-company' || channel.value === 'tiktok-company') && files.length === 0) {
    throw new Error('Instagram and TikTok posts require at least one image on this route.');
  }
  return {text,files};
}
function preview() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  previews.replaceChildren();
  try {
    for (const file of getFiles()) {
      const url = URL.createObjectURL(file);
      urls.push(url);
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Local selected image: ' + file.name;
      previews.appendChild(image);
    }
    announce('');
  } catch (error) {
    mediaInput.value = '';
    announce(error.message);
  }
}
caption.addEventListener('input', () => {
  count.textContent = caption.value.length + ' characters';
});
mediaInput.addEventListener('change', preview);
document.querySelector('#composer').addEventListener('submit', event => event.preventDefault());
document.querySelector('#copy').addEventListener('click', async () => {
  try {
    const {text} = getDraft();
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select the caption to copy it.');
    await navigator.clipboard.writeText(text);
    announce('Caption copied. Copying is not publishing.');
  } catch (error) { announce(error.message); }
});
document.querySelector('#handoff').addEventListener('click', () => {
  try {
    const {text,files} = getDraft();
    const record = {
      schema:'evercraft.clip.browser-local-handoff.v1',
      generated_at:new Date().toISOString(),
      destination:channel.value,
      brand_key:'evercraft',
      caption:text,
      media_files:files.map(file => ({name:file.name,size:file.size,type:file.type})),
      note:'Images remain on the original device; this JSON contains names and sizes, not their bytes.',
      authorization:{approved:false,authorizationRef:null},
      publication_authority:false,
      provider_status:'not_submitted',
      provider_post_id:null,
      provider_post_url:null,
      payment_status:'not_applicable'
    };
    const blob = new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'evercraft-clip-handoff.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    announce('Handoff saved locally. It has not been submitted or published.');
  } catch (error) { announce(error.message); }
});
document.querySelector('#share').addEventListener('click', async () => {
  try {
    const {text,files} = getDraft();
    if (!navigator.share) throw new Error('Your browser does not support device sharing. Use Copy caption or Save handoff.');
    const share = {text};
    if (files.length && navigator.canShare?.({files})) share.files = files;
    else if (files.length) throw new Error('Your browser cannot share these images. Save or share them manually.');
    await navigator.share(share);
    announce('Device share completed or handed to another app. Verify actual publication in that app; Clip has no post receipt.');
  } catch (error) {
    announce(error?.name === 'AbortError' ? 'Share cancelled. Nothing was confirmed published.' : error.message);
  }
});
window.addEventListener('pagehide', () => {
  for (const url of urls) URL.revokeObjectURL(url);
});
