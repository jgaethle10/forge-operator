#!/usr/bin/env python3
"""Offline fail-closed verification of the PUBLIC Kennedy marketing artifact.

The private operator app must never share this file server or be referenced
by the public page. This is a source-level gate, not a live host test.
"""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
HTML = PUBLIC / "index.html"
CADDY = ROOT / "ops" / "kennedy-public.Caddyfile.example"
EXPLORE = PUBLIC / "explore.html"

class Check(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.errors = []
        self.ids = set()
        self.anchors = []
        self.title = False
        self.has_main = False
        self.has_description = False
        self.has_viewport = False
        self.has_h1 = False
        self.svg_count = 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "form", "iframe", "object", "embed", "video", "audio", "base"):
            self.errors.append("Forbidden public element: " + tag)
        if tag == "main":
            self.has_main = True
        if tag == "h1":
            self.has_h1 = True
        if tag == "title":
            self.title = True
        if tag == "svg":
            self.svg_count += 1
        if tag == "meta" and attrs.get("name") == "viewport":
            self.has_viewport = True
        if tag == "meta" and attrs.get("name") == "description":
            self.has_description = True
        if "id" in attrs:
            if attrs["id"] in self.ids:
                self.errors.append("Duplicate HTML ID")
            self.ids.add(attrs["id"])
        if tag == "a":
            self.anchors.append(attrs.get("href", ""))
        for k,v in attrs.items():
            if k.lower().startswith("on"):
                self.errors.append("Inline event handler forbidden")
            if k in ("href", "src", "action") and v:
                if v.startswith(("http:", "https:", "//", "javascript:", "data:", "mailto:", "tel:")):
                    self.errors.append("Public page depends on an external or unsafe URL")
                if v.startswith(("/api", "/studio", "/workspace", "/home")):
                    self.errors.append("Private app route exposed from static page")
                if v.startswith("/") and v not in ("/", "/favicon.svg"):
                    self.errors.append("Unexpected absolute path " + v)
    def finish(self):
        for href in self.anchors:
            if href.startswith("#") and href[1:] not in self.ids:
                self.errors.append("Broken in-page anchor " + href)
        if not (self.title and self.has_main and self.has_description and self.has_viewport and self.has_h1 and self.svg_count >= 2):
            self.errors.append("Missing a required page landmark or concept illustration")

def inspect():
    errors = []
    if not HTML.is_file():
        return ["Missing public HTML"]
    html = HTML.read_text(encoding="utf-8")
    checker = Check()
    checker.feed(html)
    checker.finish()
    errors += checker.errors
    for private in ("fetch(", "XMLHttpRequest", "localStorage", "sessionStorage",
                    "/api/sites", "EVERCRAFT_SITE_TOKEN", "KENNEDY_PASSWORD",
                    "window.location", "Stripe(", "checkout", "document.cookie"):
        if private in html:
            errors.append("Forbidden private/commerce marker: " + private)
    if not EXPLORE.is_file():
        errors.append("Missing standalone interactive Discovery World")
    else:
        scene = EXPLORE.read_text(encoding="utf-8")
        scripts = re.findall(r"<script\b[^>]*>(.*?)</script>", scene, re.S | re.I)
        if len(scripts) != 1:
            errors.append("Discovery World must be a single inline, self-contained script")
        if not all(token in scene for token in (
            'id="world"', 'id="add-charger"', 'id="add-tree"',
            'id="add-solar"', 'id="night"', 'id="orbit"',
            "FICTIONAL DATA", "not a real address")):
            errors.append("Missing playable controls or fictional-world disclosure")
        for forbidden in ("fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(",
                          "sendBeacon(", "localStorage", "sessionStorage",
                          "document.cookie", "eval(", "new Function(",
                          "/api/", "/studio", "/workspace", "https://", "http://",
                          "<iframe", "<form", "<script src=", "import("):
            if forbidden in scene:
                errors.append("Discovery World contains forbidden private/network dependency: " + forbidden)
        if 'href="explore.html"' not in html:
            errors.append("Public home missing visible Explorer entrypoint")
    if not (PUBLIC / "favicon.svg").is_file():
        errors.append("Missing local favicon")
    if not CADDY.is_file():
        errors.append("Missing static Caddy template")
    else:
        content = CADDY.read_text(encoding="utf-8")
        active = "\n".join(row for row in content.splitlines() if not row.lstrip().startswith("#"))
        if "file_server" not in active or "{$KENNEDY_PUBLIC_DOMAIN}" not in active:
            errors.append("Static public Caddy routing missing")
        if "reverse_proxy" in active or "KENNEDY_DOMAIN}" in active or "basic_auth" in active:
            errors.append("Static Caddy template must not route to private app")
        if ("script-src 'none'" not in active or
            "script-src 'unsafe-inline'" not in active or
            active.count("connect-src 'none'") < 2 or
            active.count("form-action 'none'") < 2):
            errors.append("Homepage and Explorer need separate restrictive policies")
        if "reverse_proxy" in active or "handle /api" in active or "root * /ABSOLUTE/OWNED/REPO/products/kennedy-space-station/public" not in active:
            errors.append("Explorer gateway cannot route outside the static public directory")
        if "@static_pages path /index.html /favicon.svg" not in active or "handle /explore.html" not in active:
            errors.append("Public Caddy routes must be restricted")
    return errors

if __name__ == "__main__":
    problems = inspect()
    if problems:
        for item in problems:
            print("FAIL: " + item)
        sys.exit(1)
    print("PASS: separate static homepage and self-contained interactive Explorer; no private API, network, form or checkout.")
    print("No site was published; hostname, DNS, TLS and live mobile checks remain unverified.")
