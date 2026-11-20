#!/usr/bin/env python3
"""Kennedy Studio browser QA, on Evercraft-owned loopback, with SYNTHETIC imagery only.

This is a browser compatibility check, not a physical iPhone test, real parcel,
verified georeferencing, certified engineering, customer access or release gate.
Requires Playwright (test-only dependency) and installed Chromium/WebKit.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUTPUT = Path(os.environ.get("SITE_PLANNER_BROWSER_QA_OUTPUT", str(ROOT / "_qa-browser"))).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)


def synthetic_png():
    """Original synthetic parking-pattern PNG. Absolutely not aerial imagery."""
    width, height = 1024, 752
    rows = []
    for y in range(height):
        pixels = bytearray()
        for x in range(width):
            if y < 75 or y > 680:
                rgb = (59, 88, 66)  # abstract grass
            elif x < 75 or x > 930:
                rgb = (121, 132, 129)
            elif 170 < y < 220 or 490 < y < 550:
                rgb = (89, 94, 95)  # fictional paved lane
            elif 235 < y < 480:
                rgb = (145, 153, 153)
            else:
                rgb = (112, 121, 117)
            if (240 < y < 465 and 115 < x < 900 and x % 76 < 3):
                rgb = (239, 240, 217)  # pretend stall stripes
            pixels.extend(rgb)
        rows.append(b"\x00" + pixels)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 7))
        + chunk(b"IEND", b""))


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def check_pdf(path):
    data = path.read_bytes()
    assert data.startswith(b"%PDF-1.4\n"), "Missing PDF header"
    assert data.endswith(b"%%EOF\n"), "Incomplete PDF trailer"
    assert data.count(b"/Type /Page /Parent") == 2, "Expected S-01 and A-01 PDF pages"
    assert data.count(b"/Subtype /Image") == 2, "Expected two embedded drawing images"
    assert data.count(b"/MediaBox [0 0 1224 792]") == 2, "Expected 17x11-inch sheets"
    assert len(data) > 10_000, "Rendered PDF suspiciously small"
    return len(data)


def run_profile(playwright, name, engine, mobile, origin, image_bytes):
    browser = getattr(playwright, engine).launch(headless=True)
    profile_dir = OUTPUT / name
    profile_dir.mkdir(exist_ok=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900},
        device_scale_factor=2 if mobile else 1,
        has_touch=mobile,
        is_mobile=mobile if engine == "webkit" else False,
        accept_downloads=True,
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    try:
        page.goto(origin + "/plan-studio.html", wait_until="domcontentloaded", timeout=25000)
        page.locator("#drawing-1 #hit-target").wait_for(timeout=15000)
        assert page.locator(".quick-step").count() == 3, "Three-step default interface altered"
        assert page.locator("#advancedTools").get_attribute("open") is None, "Advanced options opened by default"
        assert page.locator("#chargerCount").inner_text().startswith("8"), "Demo fixture not loaded"
        # An uploaded source must clear demonstration marks.
        page.locator("#siteImage").set_input_files({
            "name": "SYNTHETIC-NOT-A-REAL-PROPERTY.png",
            "mimeType": "image/png",
            "buffer": image_bytes,
        })
        page.wait_for_function("state.siteImage.startsWith('data:image/png;base64,') && state.marks.length===0", timeout=20000)
        assert "Operator image" in page.locator("#sourceState").inner_text()
        page.screenshot(path=str(profile_dir / "phone-editor-before-placement.png"), full_page=False)

        hit = page.locator("#drawing-1 #hit-target")
        hit.click(position={"x": 145, "y": 165})
        assert page.evaluate("state.marks.filter(m=>m.type==='charger').length") == 1
        first = page.evaluate("({x:state.marks[0].x,y:state.marks[0].y})")
        hit.click(position={"x": 145, "y": 165})
        assert page.evaluate("state.selectedMarkIndex") == 0, "Touch selection failed"
        hit.click(position={"x": 260, "y": 230})
        moved = page.evaluate("({x:state.marks[0].x,y:state.marks[0].y})")
        assert first != moved, "Charger didn't move"
        page.locator("#undo").click()
        assert first == page.evaluate("({x:state.marks[0].x,y:state.marks[0].y})"), "Undo didn't restore placement"

        # Exercise address-to-site + vicinity workflow with a SYNTHETIC MOCK provider.
        # Real Census/USGS network acceptance has a separate public-fixture receipt.
        jpeg_pair = page.evaluate("""async () => {
          const image = new Image();
          image.src = state.siteImage;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = 1024; canvas.height = 752;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image,0,0,1024,752);
          const site = canvas.toDataURL('image/jpeg',0.9).split(',')[1];
          ctx.fillStyle = '#244c67';
          ctx.fillRect(100,100,175,45);
          const vicinity = canvas.toDataURL('image/jpeg',0.9).split(',')[1];
          return {site,vicinity};
        }""")
        def image_record(encoded, bbox):
            return {
                "image_base64": encoded,
                "sha256": hashlib.sha256(base64.b64decode(encoded)).hexdigest(),
                "bbox_3857": bbox,
            }
        preview = {
            "schema": "evercraft.site-planner.usgs-address-aerial.v1",
            "match_class": "census_address_range_not_parcel",
            "census_matched_address": "SYNTHETIC TEST FIXTURE / NOT A REAL PARCEL",
            "approximate_address_coordinate": {"lon": -76.93, "lat": 38.85},
            "site": image_record(jpeg_pair["site"], [0, 0, 640, 470]),
            "vicinity": image_record(jpeg_pair["vicinity"], [0, 0, 4800, 3525]),
        }
        page.route("**/api/aerial/preview", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps(preview)
        ))
        page.locator("#address").fill("123 Synthetic QA Lane, Test District, DC 20000")
        page.locator("#lookupAerial").click()
        page.wait_for_function(
            "state.aerialProvenance !== null && state.contextImage.startsWith('data:image/jpeg;base64,')",
            timeout=15000,
        )
        assert page.evaluate("state.marks.length") == 0, "Old placements survived an address-source change"
        assert page.evaluate("state.siteHash !== state.contextHash"), "Distinct source images expected"
        assert "SOURCE: USGS / CENSUS PREVIEW" in page.locator("#drawing-1").inner_html(), "Site image provenance missing"
        assert "USGS VICINITY IMAGE" in page.locator("#drawing-2").inner_html(), "Vicinity provenance missing"
        assert "No geocoding performed" not in page.locator("#drawing-2").inner_html(), "Sheet ignores address source"
        page.locator("#drawing-1 #hit-target").click(position={"x": 180, "y": 190})
        assert page.evaluate("state.marks.filter(m=>m.type==='charger').length") == 1
        # Mark mock provenance prominently in generated QA-only sheet, never a customer report.
        page.evaluate("""() => {
          document.getElementById('sourceText').value='SYNTHETIC MOCK IMAGE / NOT REAL USGS';
          draw();
        }""")
        page.locator("#drawing-1").screenshot(path=str(profile_dir / "sheet-S01.png"))
        page.locator("#drawing-2").screenshot(path=str(profile_dir / "sheet-A01.png"))

        # Real app's rasterSheet(), PDF generator, and download link, not a mocked writer.
        page.locator("#print").click()
        page.locator("#pdfDownload:not([hidden])").wait_for(timeout=30000)
        assert page.locator("#pdfReady:not([hidden])").is_visible()
        with page.expect_download(timeout=15000) as download_info:
            page.locator("#pdfDownload").click()
        download = download_info.value
        assert download.suggested_filename.endswith(".pdf")
        pdfpath = profile_dir / "Kennedy-Concept-SYNTHETIC.pdf"
        download.save_as(pdfpath)
        size = check_pdf(pdfpath)
        # Editing the drawing must hide old PDF links and revoke its object URL.
        hit.click(position={"x": 310, "y": 275})
        assert page.locator("#pdfReady").is_hidden() and page.locator("#pdfDownload").is_hidden(), "Old PDF still active after edit"
        assert not errors, "Browser JS errors: " + "; ".join(errors)
        return {
            "profile": name, "engine": engine, "mobile_emulation": mobile,
            "site_image": "original synthetic test fixture; not real aerial imagery",
            "three_steps": True, "upload": "pass", "tap_add": "pass",
            "tap_select_move_undo": "pass", "mocked_address_preview_with_two_sources": "pass",
            "source_labels": "pass", "pdf_generation": "pass",
            "pdf_pages": 2, "pdf_bytes": size, "stale_export_invalidation": "pass",
            "physical_ios_tested": False,
        }
    finally:
        context.close()
        browser.close()


def main():
    image = synthetic_png()
    with tempfile.TemporaryDirectory(prefix="site-planner-browser-qa-") as temp:
        port = free_port()
        env = os.environ.copy()
        env.update({
            "EVERCRAFT_SITE_HOST": "127.0.0.1",
            "EVERCRAFT_SITE_PORT": str(port),
            "EVERCRAFT_SITE_DATA": temp,
            "EVERCRAFT_SITE_TOKEN": "",
        })
        server = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            origin = f"http://127.0.0.1:{port}"
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("Private server exited before browser check")
                try:
                    with urlopen(origin + "/api/health", timeout=1) as res:
                        if res.status == 200:
                            break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Private server did not start")
            receipt = {
                "schema": "evercraft.site-planner.browser-acceptance.v1",
                "checked_at_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                "scope": "local loopback only; no customer data",
                "real_property_source": False,
                "phone_emulation_not_real_ios": True,
                "profiles": [],
            }
            with sync_playwright() as playwright:
                for name, engine, mobile in (
                    ("chromium-desktop", "chromium", False),
                    ("webkit-phone-emulated", "webkit", True),
                ):
                    receipt["profiles"].append(run_profile(playwright, name, engine, mobile, origin, image))
            (OUTPUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print("KENNEDY_BROWSER_ACCEPTANCE_PASS")
            for p in receipt["profiles"]:
                print(p["profile"], "2-page PDF", p["pdf_bytes"], "bytes; phone-emulated", p["mobile_emulation"])
            return 0
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
