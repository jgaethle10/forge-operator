(() => {
  "use strict";
  const defaults = globalThis.HumanFilterRules.DEFAULTS;
  const $ = id => document.getElementById(id);
  const ui = { enabled: $("enabled"), status: $("status"), facebook: $("facebook"), reddit: $("reddit"), youtube: $("youtube"), keywords: $("keywords"), saved: $("saved") };
  let loaded = false;
  let debounce;
  function readInputs() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const customKeywords = Array.from(new Set(ui.keywords.value.split(",").map(x => x.trim()).filter(x => x.length >= 3 && x.length <= 60))).slice(0, 40);
    return {
      enabled: ui.enabled.checked,
      mode,
      filterDeclared: true,
      filterTopics: mode === "strict",
      sites: { facebook: ui.facebook.checked, reddit: ui.reddit.checked, youtube: ui.youtube.checked },
      customKeywords
    };
  }
  function showSettings(s) {
    ui.enabled.checked = s.enabled;
    for (const site of ["facebook", "reddit", "youtube"]) ui[site].checked = s.sites[site] !== false;
    const selected = document.querySelector(`input[name="mode"][value="${s.mode === "strict" ? "strict" : "balanced"}"]`);
    selected.checked = true;
    ui.keywords.value = (s.customKeywords || []).join(", ");
    ui.status.textContent = s.enabled ? "Active on enabled sites" : "Paused on all sites";
  }
  async function save() {
    if (!loaded) return;
    const next = readInputs();
    ui.status.textContent = next.enabled ? "Active on enabled sites" : "Paused on all sites";
    try { await chrome.storage.local.set({ settings: next }); ui.saved.textContent = "Saved locally ✓"; }
    catch { ui.saved.textContent = "Unable to save settings"; }
  }
  async function start() {
    try {
      const data = await chrome.storage.local.get("settings");
      const s = { ...defaults, ...(data.settings || {}), sites: { ...defaults.sites, ...(data.settings?.sites || {}) } };
      showSettings(s);
      loaded = true;
      document.querySelectorAll('input:not([type="text"])').forEach(el => el.addEventListener("change", save));
      ui.keywords.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(save, 400); });
    } catch { ui.status.textContent = "Storage unavailable"; }
  }
  start();
})();
