/* Evercraft Journal owned reader. Adapted from preserved October 2026 Journal source. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const play = byId('play');
  const pause = byId('pause');
  const stop = byId('stop');
  const speed = byId('speed');
  const status = byId('listen-status');
  const article = byId('article-body');
  if (!play || !pause || !stop || !speed || !status || !article) return;

  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  let active = false;
  let paused = false;
  let session = 0;
  let index = 0;
  let chunks = [];
  const announce = message => { status.textContent = message; };
  const buttons = playing => {
    play.disabled = playing;
    pause.disabled = !playing;
    stop.disabled = !playing;
    pause.textContent = 'Pause';
    pause.setAttribute('aria-label', 'Pause article read aloud');
  };
  if (!supported) {
    play.disabled = true;
    announce('Read aloud is unavailable in this browser. The article remains fully readable.');
    return;
  }
  const split = (value, max = 175) => {
    const result = [];
    let current = '';
    for (const word of value.replace(/\s+/g, ' ').trim().split(' ')) {
      if (!word) continue;
      if ((current + ' ' + word).trim().length > max) {
        if (current) result.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) result.push(current);
    return result;
  };
  const readNext = id => {
    if (!active || id !== session) return;
    if (index >= chunks.length) {
      active = false;
      paused = false;
      buttons(false);
      announce('End of article.');
      return;
    }
    const at = index;
    const utterance = new SpeechSynthesisUtterance(chunks[at]);
    utterance.lang = 'en-US';
    utterance.rate = Number(speed.value) || 1;
    utterance.onend = () => {
      if (!active || id !== session || index !== at) return;
      index += 1;
      readNext(id);
    };
    utterance.onerror = event => {
      if (id !== session) return;
      active = false;
      paused = false;
      buttons(false);
      announce('Read aloud stopped. You can continue reading or use your device accessibility reader.');
    };
    try { synth.speak(utterance); }
    catch (_) {
      active = false;
      buttons(false);
      announce('Read aloud could not start on this device.');
    }
  };
  play.addEventListener('click', () => {
    session += 1;
    synth.cancel();
    const text = [...article.querySelectorAll('h2,p')]
      .map(el => el.textContent.trim()).filter(Boolean).join('. ');
    chunks = split(text);
    if (!chunks.length) {
      announce('No article text is available to read aloud.');
      return;
    }
    active = true;
    paused = false;
    index = 0;
    buttons(true);
    announce('Reading article aloud.');
    readNext(session);
  });
  pause.addEventListener('click', () => {
    if (!active) return;
    try {
      if (paused) {
        synth.resume(); paused = false;
        pause.textContent = 'Pause';
        pause.setAttribute('aria-label', 'Pause article read aloud');
        announce('Read aloud resumed.');
      } else {
        synth.pause(); paused = true;
        pause.textContent = 'Resume';
        pause.setAttribute('aria-label', 'Resume article read aloud');
        announce('Read aloud paused.');
      }
    } catch (_) { announce('Pause is unavailable on this device. You can stop reading aloud.'); }
  });
  stop.addEventListener('click', () => {
    session += 1;
    active = false;
    paused = false;
    synth.cancel();
    buttons(false);
    announce('Read aloud stopped.');
  });
  window.addEventListener('pagehide', () => {
    session += 1;
    active = false;
    synth.cancel();
  });
})();
