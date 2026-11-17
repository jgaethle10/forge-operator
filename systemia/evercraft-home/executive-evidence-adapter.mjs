import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const receiptSchema = "evercraft.journal.publication-receipt.v1";
const journalSchema = "evercraft.journal.index.v1";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const digest = (payload) => createHash("sha256").update(payload).digest("hex");

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function journalEvidence(root) {
  const journalRoot = path.join(root, "public", "journal");
  const index = readJson(path.join(journalRoot, "index.json"));
  const held = (state, detail) => ({
    state, detail, title: null, published_at: null,
    source_canonical_url: null, article_sha256: null,
    external_https_verified: false,
  });
  if (!index || index.schema !== journalSchema || !Array.isArray(index.stories)) {
    return held("source_unavailable", "The canonical Journal source index is not readable.");
  }
  const latest = [...index.stories]
    .filter((row) => row && typeof row.slug === "string" && slugPattern.test(row.slug))
    .sort((a,b) => String(b.published_at || "").localeCompare(String(a.published_at || "")))[0];
  if (!latest) return held("no_source_story", "No eligible live-edition story appears in the local index.");
  const slug = latest.slug;
  const receipt = readJson(path.join(journalRoot, "receipts", slug + ".json"));
  const articleFile = path.join(journalRoot, slug, "index.html");
  if (!receipt || !fs.existsSync(articleFile)) {
    return held("receipt_missing", "The indexed article is missing its on-disk publication receipt or artifact.");
  }
  let articleDigest;
  try {
    const stat = fs.statSync(articleFile);
    if (!stat.isFile()) return held("article_invalid", "The article source artifact is not a regular file.");
    articleDigest = digest(fs.readFileSync(articleFile));
  } catch {
    return held("article_unreadable", "The article source artifact cannot be read.");
  }
  if (
    receipt.schema !== receiptSchema ||
    receipt.slug !== slug ||
    receipt.story_id !== latest.story_id ||
    receipt.canonical_url !== latest.canonical_url ||
    receipt.publication_authority !== true ||
    receipt.publication_state !== "live" ||
    receipt.article_sha256 !== articleDigest
  ) {
    return held("receipt_mismatch", "The Journal receipt does not match the indexed article and exact on-disk bytes.");
  }
  const handoffRef = "production/" + slug + "/clip-handoff.json";
  const handoffPresent = receipt.clip_handoff_ref === handoffRef &&
    fs.existsSync(path.join(journalRoot, "production", slug, "clip-handoff.json"));
  return {
    state: "source_receipt_verified",
    detail: "Journal index, on-disk article digest, and source publication receipt agree. Public HTTPS was not checked here.",
    slug, title: String(latest.title || receipt.title || ""),
    published_at: String(receipt.published_at || ""),
    source_canonical_url: String(receipt.canonical_url),
    article_sha256: articleDigest,
    clip_handoff_source_present: handoffPresent,
    external_https_verified: false,
  };
}

export function readExecutiveEvidence({ repoRoot, now = new Date() } = {}) {
  const root = String(repoRoot || "").trim();
  if (!root) throw new Error("executive_evidence_repo_root_required");
  const journal = journalEvidence(path.resolve(root));
  const handoff = journal.state === "source_receipt_verified" && journal.clip_handoff_source_present === true;
  return {
    schema: "evercraft.home.executive-evidence.v1",
    observed_at: new Date(now).toISOString(),
    source: "local_repository_artifacts_only",
    journal,
    clip: {
      state: handoff ? "handoff_source_present" : "provider_receipt_unverified",
      detail: handoff
        ? "A Journal-to-Clip handoff file exists in source. No social provider publication receipt was inspected."
        : "No verified Journal-to-Clip handoff was available from this source view.",
      provider_post_verified: false,
      provider_permalink: null,
    },
    payments: {
      state: "canonical_order_feed_not_connected",
      detail: "No authenticated Evercraft Payments order/settlement feed is attached to this Home readback. Sales, paid orders and revenue are unknown, never zero.",
      paid_orders_verified: null,
      revenue_verified: null,
      checkout_or_provider_page_is_payment_receipt: false,
    },
    actions_performed: false,
    secrets_returned: false,
  };
}
