"""Public, logged-out, non-intercepted social-site diagnostics for HumanFilter.

Uses *real* remote pages with extension loaded in Chromium. Results are evidence,
not a claim of AI-media classification or logged-in platform compatibility.
This intentionally tolerates geo restrictions, bot blocks and login walls.
"""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "extension"
REPORTS = ROOT.parent / "public-site-evidence"
REPORTS.mkdir(exist_ok=True)
SITES = [
    ("youtube", "https://www.youtube.com/results?search_query=made+with+ai", "ytd-video-renderer, ytd-rich-grid-media, ytd-compact-video-renderer"),
    ("reddit", "https://www.reddit.com/r/artificial/", "shreddit-post, [data-testid='post-container'], article[data-post-id]"),
    ("facebook", "https://www.facebook.com/Meta/", "div[role='article']"),
]
summary = []
with tempfile.TemporaryDirectory(prefix="humanfilter-public-sites-") as user_dir:
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_dir, channel="chromium", headless=True,
            args=["--no-sandbox", f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"],
        )
        for name, target, selector in SITES:
            page = context.new_page()
            item = {"site": name, "requested_url": target, "live_page_loaded": False,
                    "real_post_cards": 0, "synthetic_probe_filtered": False,
                    "extension_loaded": False, "live_AI_post_identified": False}
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)[:300]))
            try:
                response = page.goto(target, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3500)
                item["url"] = page.url
                item["http_status"] = response.status if response else None
                item["title"] = page.title()[:160]
                item["real_post_cards"] = page.locator(selector).count()
                item["live_page_loaded"] = bool(
                    response and 200 <= response.status < 400
                    and page.locator("body").count() > 0
                    and len(page.locator("body").inner_text(timeout=6000)) > 80
                )
                # Test the actual extension injection on this real host, but
                # DO NOT conflate our own probe with detection of a real post.
                page.evaluate("""() => {
                    const control = document.createElement('div');
                    control.id = 'hf-control-probe';
                    control.textContent = 'A sunny walk with my dog';
                    const suspect = document.createElement('div');
                    suspect.id = 'hf-ai-probe';
                    suspect.textContent = 'I created this with AI';
                    const host = location.hostname;
                    if (host.includes('facebook.com')) {
                        control.setAttribute('role','article');
                        suspect.setAttribute('role','article');
                    } else if (host.includes('reddit.com')) {
                        control.setAttribute('data-testid','post-container');
                        suspect.setAttribute('data-testid','post-container');
                    } else {
                        control.className = 'ytd-video-renderer';
                        suspect.className = 'ytd-video-renderer';
                        // Native tags matter for YouTube's DOM matcher.
                        const c = document.createElement('ytd-video-renderer');
                        c.id = control.id; c.textContent = control.textContent;
                        const s = document.createElement('ytd-video-renderer');
                        s.id = suspect.id; s.textContent = suspect.textContent;
                        document.body.append(c,s); return;
                    }
                    document.body.append(control, suspect);
                }""")
                try:
                    page.locator("#hf-ai-probe[data-humanfilter-hidden='true']").wait_for(state="attached", timeout=8000)
                    item["synthetic_probe_filtered"] = page.locator("#hf-control-probe[data-humanfilter-hidden='true']").count() == 0
                except Exception as e:
                    item["probe_error"] = str(e)[:250]
                item["extension_loaded"] = bool(item["synthetic_probe_filtered"])
                item["page_errors"] = errors[:3]
                page.screenshot(path=str(REPORTS / (name + ".png")), full_page=False, timeout=8000)
            except Exception as e:
                item["access_error"] = str(e)[:350]
            finally:
                summary.append(item)
                print(json.dumps(item, ensure_ascii=False), flush=True)
                page.close()
        context.close()
(REPORTS / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf8")
print("NOTE: public-site diagnostics are non-gating; synthetic probes are not real AI content.")
