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
    /\b(?:ai[- ]generated|synthetic) (?:image|video|art|picture|footage|illustration|portrait|media|content)\b/i,
    /(?:^|\s)#(?:aigenerated|aiartwork|aigeneratedart|madewithai|generativeaiart)(?=\b|$)/i
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
    if (matchTopics && (topicTerms.some(t => folded.includes(t)) || /\b(?:AI|GenAI)\b/.test(str))) {
      return { kind: "topic", reason: "AI topic keyword" };
    }
    const terms = Array.isArray(settings.customKeywords) ? settings.customKeywords : [];
    for (const raw of terms.slice(0, 40)) {
      const term = normal(raw).trim();
      if (term.length >= 3 && term.length <= 60 && folded.includes(term)) {
        return { kind: "keyword", reason: `Your keyword: ${term.slice(0, 40)}` };
      }
    }
    return null;
  }
  root.HumanFilterRules = Object.freeze({ DEFAULTS, classify, isSiteEnabled });
})(typeof globalThis !== "undefined" ? globalThis : this);
