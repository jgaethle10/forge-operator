// One-prompt Fallen Studios handoff. The creative idea remains in this browser tab
// until the visitor explicitly submits the separate consented commercial inquiry.
// Never put a private creative brief in a URL or send it to an external service.
export const FALLEN_IDEA_KEY = "evercraft.fallen.idea.v1";
export const FALLEN_IDEA_MAX_LENGTH = 1800;
export const FALLEN_IDEA_MAX_AGE_MS = 30 * 60 * 1000;

export function storeFallenIdea(storage, value, now = Date.now()) {
  if (typeof value !== "string") return {ok:false,reason:"invalid"};
  const idea = value.trim();
  if (idea.length < 12) return {ok:false,reason:"too_short"};
  if (idea.length > FALLEN_IDEA_MAX_LENGTH) return {ok:false,reason:"too_long"};
  storage.setItem(FALLEN_IDEA_KEY, JSON.stringify({idea,createdAt:now}));
  return {ok:true};
}

export function takeFallenIdea(storage, now = Date.now()) {
  const raw = storage.getItem(FALLEN_IDEA_KEY);
  if (raw === null) return null;
  // One use only, even if corrupt or expired.
  storage.removeItem(FALLEN_IDEA_KEY);
  try {
    const record = JSON.parse(raw);
    if (!record || typeof record.idea !== "string" ||
        typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt) ||
        record.createdAt > now || now - record.createdAt > FALLEN_IDEA_MAX_AGE_MS) return null;
    const idea = record.idea.trim();
    if (idea.length < 12 || idea.length > FALLEN_IDEA_MAX_LENGTH) return null;
    return idea;
  } catch {
    return null;
  }
}
