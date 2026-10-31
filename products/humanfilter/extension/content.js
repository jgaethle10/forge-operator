(() => {
  "use strict";
  if (globalThis.__humanfilterInitialized) return;
  globalThis.__humanfilterInitialized = true;
  const { DEFAULTS, classify } = globalThis.HumanFilterRules;
  const host = location.hostname;
  const site = host.includes("facebook.com") ? "facebook" : host.includes("reddit.com") ? "reddit" : "youtube";
  const selectors = {
    facebook: 'div[role="article"]',
    reddit: 'shreddit-post, [data-testid="post-container"], article[data-post-id]',
    youtube: 'ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer'
  };
  let settings = DEFAULTS;
  let queued = false;
  let observer;
  // A feed can recycle a card DOM node for a different post.
  // A one-time reveal must never transfer to that replacement post.
  const revealedSignatures = new WeakMap();
  // Replies and comments may contain AI disclosures about *their own* content.
  // They must not cause a human-authored parent feed card to be filtered.
  const NON_POST_CONTEXT = [
    'shreddit-comment', 'ytd-comment-thread-renderer', 'ytd-comment-view-model',
    '[role="comment"]', '[data-testid="comment"]',
    '[data-testid="comment-container"]', '[data-testid="comments"]'
  ].join(', ');
  function isNestedContext(element, post) {
    const closest = element.closest?.(NON_POST_CONTEXT);
    return Boolean(closest && closest !== post && post.contains(closest));
  }

  function readLabels(element) {
    // Restrict platform labels to short, visible-like metadata elements.
    const labels = [];
    const items = element.querySelectorAll('[aria-label], [data-testid*="label"], [data-testid*="flair"], [title]');
    for (const el of [element, ...Array.from(items).slice(0, 70)]) {
      if (isNestedContext(el, element) || el.closest?.('.humanfilter-notice')) continue;
      for (const value of [el.getAttribute("aria-label"), el.getAttribute("title")]) {
        if (value && value.length < 100) labels.push(value);
      }
      if (el.matches('[data-testid*="label"], [data-testid*="flair"]')) {
        const value = el.textContent?.trim();
        if (value && value.length < 100) labels.push(value);
      }
    }
    // On some platforms an AI disclosure is rendered as short visible text
    // rather than an ARIA label. Trust only exact short leaf labels, never
    // arbitrary mention of AI inside a paragraph or unrelated discussion.
    const exact = /^(?:ai info|made with ai|ai-generated|generated with ai|synthetic media|altered or synthetic content)$/i;
    let checked = 0;
    for (const el of element.querySelectorAll('span, small, label, yt-formatted-string, div')) {
      if (++checked > 350) break;
      if (el.childElementCount !== 0 || isNestedContext(el, element) || el.closest('.humanfilter-notice')) continue;
      const value = el.textContent?.trim();
      if (value && value.length <= 45 && exact.test(value)) labels.push(value);
    }
    return labels;
  }

  function clean(element) {
    element.removeAttribute("data-humanfilter-hidden");
    element.removeAttribute("data-humanfilter-revealed");
    const notice = Array.from(element.children).find(n => n.classList?.contains("humanfilter-notice"));
    if (notice) notice.remove();
  }

  function cover(element, result) {
    let notice = Array.from(element.children).find(n => n.classList?.contains("humanfilter-notice"));
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "humanfilter-notice";
      const info = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = "HumanFilter softened this post";
      const reason = document.createElement("small");
      reason.className = "humanfilter-reason";
      info.append(heading, reason);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Show once";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        element.removeAttribute("data-humanfilter-hidden");
        revealedSignatures.set(element, postIdentity(element));
        element.setAttribute("data-humanfilter-revealed", "true");
        notice.remove();
      });
      notice.append(info, button);
      element.append(notice);
    }
    const label = notice.querySelector(".humanfilter-reason");
    if (label && label.textContent !== `${result.reason}. May be inaccurate.`) label.textContent = `${result.reason}. May be inaccurate.`;
    if (element.getAttribute("data-humanfilter-hidden") !== "true") element.setAttribute("data-humanfilter-hidden", "true");
  }

  function postText(post) {
    // Never classify a feed card using the contents of nested replies.
    // Include real post text, omit our notice and secondary comment context.
    let text = '';
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.humanfilter-notice') || isNestedContext(parent, post)) continue;
      if (node.nodeValue?.trim()) text += node.nodeValue + ' ';
      if (text.length > 10000) break;
    }
    return text.slice(0, 10000);
  }

  function postIdentity(post) {
    // The visible text can be identical on two recycled cards.
    // Include a post-specific permalink when present so Show once does not leak.
    const link = post.querySelector('a[href*="/comments/"], a[href*="/posts/"], a[href*="/videos/"], a[href*="/watch?"], a[href*="/shorts/"]');
    const permalink = link?.getAttribute('href') || '';
    return permalink + '\u0000' + postText(post).replace(/\s+/g, ' ').trim() +
      '\u0000' + readLabels(post).join('\u0001');
  }

  function scan() {
    queued = false;
    const posts = document.querySelectorAll(selectors[site]);
    for (const post of posts) {
      // Preserve a reveal only while the card still represents the same post.
      // Some virtualized feeds replace all content inside an existing DOM node.
      if (post.getAttribute("data-humanfilter-revealed") === "true") {
        if (revealedSignatures.get(post) === postIdentity(post)) continue;
        revealedSignatures.delete(post);
        clean(post);
      }
      const result = classify({ site, text: postText(post), labels: readLabels(post) }, settings);
      if (result) cover(post, result);
      else if (post.hasAttribute("data-humanfilter-hidden")) clean(post);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }
  function resetAndRescan() {
    document.querySelectorAll('[data-humanfilter-hidden], [data-humanfilter-revealed]').forEach(clean);
    schedule();
  }
  async function begin() {
    try {
      const stored = await chrome.storage.local.get("settings");
      if (stored.settings) settings = { ...DEFAULTS, ...stored.settings, sites: { ...DEFAULTS.sites, ...stored.settings.sites } };
    } catch (err) { console.warn("HumanFilter: settings unavailable", err); }
    observer = new MutationObserver((records) => {
      // Avoid a self-triggered scan when the extension adds its own notice.
      if (records.some((record) => {
        if (record.target instanceof Element && record.target.closest(".humanfilter-notice")) return false;
        if (record.type === "childList" && record.removedNodes.length === 0 && record.addedNodes.length &&
            Array.from(record.addedNodes).every((n) => n instanceof Element && n.classList.contains("humanfilter-notice"))) return false;
        return true;
      })) schedule();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const value = changes.settings.newValue || {};
      settings = { ...DEFAULTS, ...value, sites: { ...DEFAULTS.sites, ...value.sites } };
      resetAndRescan();
    });
    schedule();
  }
  begin();
})();
