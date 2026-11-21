import { analyzePrompt, renderWebsite } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const form = $('builder');
const promptField = $('prompt');
const kindField = $('kind');
const brandField = $('brand');
const status = $('form-status');
let activeBrief = null;
let activeHtml = null;

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function download(filename, data, mime) {
  const blob = new Blob([data], {type:mime});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'my-build';
}
function showList(list, items) {
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
}
function showResult(brief) {
  activeBrief = brief;
  activeHtml = brief.preview_supported ? renderWebsite(brief) : null;
  $('empty-state').hidden = true;
  $('result').hidden = false;
  $('result-mode').textContent = brief.kind_name;
  $('result-name').textContent = brief.brand;
  $('result-description').textContent = brief.deliverable;
  $('frame-wrap').hidden = !brief.preview_supported;
  $('download-html').hidden = !brief.preview_supported;
  if (brief.preview_supported) {
    // An opaque-origin, script-disabled sandbox. No customer text is executed.
    $('preview').srcdoc = activeHtml;
  } else {
    $('preview').removeAttribute('srcdoc');
  }
  const scopeItems = brief.requested_features.length
    ? brief.requested_features.map((feature) => feature + ' (not connected)')
    : ['Business information', 'Accessible layout', 'Review and approval'];
  showList($('features'), scopeItems.concat(brief.next_steps.map((step) => 'Next: ' + step)));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const brief = analyzePrompt({
      prompt:promptField.value,
      kind:kindField.value,
      brand:brandField.value,
    });
    showResult(brief);
    setStatus('Created on this device. Nothing was uploaded, purchased, or deployed.');
    $('result').scrollIntoView({behavior:'smooth', block:'nearest'});
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not create this concept.', true);
    promptField.focus();
  }
});

for (const example of document.querySelectorAll('[data-example]')) {
  example.addEventListener('click', () => {
    promptField.value = example.dataset.example || '';
    brandField.value = example.dataset.brand || '';
    kindField.value = example.dataset.kind || 'website';
    setStatus('Example loaded. Edit it or select Create my concept.');
    promptField.focus();
  });
}
$('download-html').addEventListener('click', () => {
  if (!activeBrief?.preview_supported || !activeHtml) return;
  download(slugify(activeBrief.brand) + '-concept.html', activeHtml, 'text/html;charset=utf-8');
  setStatus('Static HTML concept downloaded. It is not a production deployment.');
});
$('download-brief').addEventListener('click', () => {
  if (!activeBrief) return;
  download(slugify(activeBrief.brand) + '-build-brief.json', JSON.stringify(activeBrief,null,2) + '\n', 'application/json;charset=utf-8');
  setStatus('Build brief downloaded locally. No project or obligation was created.');
});
