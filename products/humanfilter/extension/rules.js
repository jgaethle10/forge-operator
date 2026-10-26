/* Evercraft HumanFilter: deterministic, local-only classification. */
(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({
    enabled: true,
    mode: "balanced",
    sites: { facebook: true, reddit: true, youtube: true },
    filterTopics: false,
    filterDeclared: true,
    customKeywords: []
  });

  const selfDeclaration = [
    /\b(?:i (?:made|created|generated) (?:this|it)|made (?:this|it)|created (?:this|it)) (?:with|using) (?:generative )?ai\b/i,
    /\b(?:made|created|generated|produced) (?:with|using|by) (?:chatgpt|midjourney|dall[ -]?e|stable diffusion|sora|ideogram|flux(?:\s+ai)?)\b/i,
    /^(?:an?\s+)?(?:ai[- ]generated|synthetic) (?:image|video|art|picture|footage|illustration|portrait|media|content)(?:\s*[:.\-–!]|\s*$)/i,
    /\b(?:made|created|generated|produced|rendered|animated|illustrated) (?:entirely |partly )?(?:with|using|by) (?:an? )?(?:generative )?ai\b/i,
    /\b(?:image|photo|picture|video|artwork|portrait|music|song|animation|illustration|footage) (?:is|was) (?:entirely )?(?:ai[- ]generated|made by ai)\b/i,
    /(?:^|\s)#(?:aigenerated|aiartwork|aigeneratedart|madewithai|generativeaiart|aivideo|aiimage|aianimation)(?=\b|$)/i
  ];
  const platformLabel = [
    /^(?:made with ai|ai[- ]generated|generated with ai|synthetic media|ai[- ]created|ai[- ]modified|ai info|altered or synthetic content)$/i,
    /^includes (?:ai[- ]generated|synthetic|altered) (?:content|media)$/i
  ];
  const topicTerms = [
    "artificial intelligence", "generative ai", "chatgpt", "midjourney", "stable diffusion",
    "dall-e", "dall·e", "deepfake", "ai generated", "ai-generated", "ai art", "ai slop"
  ];
  function normal(s) { return String(s ?? "").normalize("NFKC").toLowerCase(); }
  // Only match topic words or user keywords on full boundaries. Before this,
  // terms such as "sora" could hide unrelated words such as "soraka".
  // JavaScript Unicode word classes protect non-English letter boundaries too.
  function containsTerm(text, rawTerm) {
    const term = normal(rawTerm).trim();
    if (!term) return false;
    let start = 0;
    while (start < text.length) {
      const i = text.indexOf(term, start);
      if (i < 0) return false;
      const left = i === 0 ? '' : text[i - 1];
      const right = text[i + term.length] || '';
      const startIsWord = /[\p{L}\p{N}]/u.test(term[0]);
      const endIsWord = /[\p{L}\p{N}]/u.test(term[term.length - 1]);
      if ((!startIsWord || !/[\p{L}\p{N}]/u.test(left)) &&
          (!endIsWord || !/[\p{L}\p{N}]/u.test(right))) return true;
      start = i + 1;
    }
    return false;
  }
  function isSiteEnabled(settings, site) {
    return Boolean(settings.enabled && settings.sites?.[site] !== false);
  }
  function classify({ text = "", labels = [], site = "" }, settings = DEFAULTS) {
    if (!isSiteEnabled(settings, site)) return null;
    const str = String(text).slice(0, 10000);
    const useDeclared = settings.filterDeclared !== false;
    if (useDeclared) {
      const label = labels.find(x => platformLabel.some(r => r.test(String(x).trim())));
      if (label) return { kind: "declared", reason: "AI label detected" };
      if (selfDeclaration.some(r => r.test(str))) return { kind: "declared", reason: "AI-generation wording detected" };
    }
    const matchTopics = settings.mode === "strict" || settings.filterTopics === true;
    const folded = normal(str);
    // Strict is explicitly about AI TOPICS, not proof of authorship.
    // A standalone uppercase "AI" is a common title/hashtag on video feeds;
    // avoid lowercase substrings that would match ordinary words like "said".
    if (matchTopics && (topicTerms.some(t => containsTerm(folded, t)) || /\b(?:AI|GenAI)\b/.test(str))) {
      return { kind: "topic", reason: "AI topic keyword" };
    }
    const terms = Array.isArray(settings.customKeywords) ? settings.customKeywords : [];
    for (const raw of terms.slice(0, 40)) {
      const term = normal(raw).trim();
      if (term.length >= 3 && term.length <= 60 && containsTerm(folded, term)) {
        return { kind: "keyword", reason: `Your keyword: ${term.slice(0, 40)}` };
      }
    }
    return null;
  }
  root.HumanFilterRules = Object.freeze({ DEFAULTS, classify, isSiteEnabled });
})(typeof globalThis !== "undefined" ? globalThis : this);
