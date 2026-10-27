#!/usr/bin/env python3
"""Visual browser QA for the standalone HAVENLY Cleaning review branch.
Does not submit inquiries or write customer data.
"""
from pathlib import Path
import os
import shutil
import sys
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
site = root / "public" / "havenly" / "index.html"
output = root / "artifacts" / "havenly-visual-audit"
output.mkdir(parents=True, exist_ok=True)

checks = []
with sync_playwright() as p:
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    opts = {"headless": True, "args": ["--no-sandbox"]}
    if chrome:
        opts["executable_path"] = chrome
    browser = p.chromium.launch(**opts)
    try:
        for name, width, height in [("phone-375", 375, 812), ("phone-390", 390, 844), ("tablet-768", 768, 1024), ("desktop-1440", 1440, 900)]:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(site.as_uri(), wait_until="domcontentloaded")
            assert page.get_by_role("heading", name="Meet Nikki.").count() == 1, "Founder's story missing"
            assert page.locator("#planService").count() == 1, "Interactive cleaning builder missing"
            assert page.locator("#textRequest").count() == 1, "Manual inquiry option missing"
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            assert overflow <= 2, f"Horizontal overflow at {width}px: {overflow}px"
            if width <= 730:
                menu = page.locator("details.mobile-menu")
                assert menu.is_visible(), "Mobile menu absent"
                menu.locator("summary").click()
                assert menu.locator('a[href="#plan"]').is_visible(), "Mobile menu cannot reach cleaning builder"
                menu.locator("summary").click()
            page.locator("#planService").select_option("Deep cleaning")
            page.locator("#planFrequency").select_option("Bi-weekly")
            page.locator("#planBedrooms").select_option("3")
            page.locator("#planBathrooms").select_option("2")
            page.locator("#planSize").select_option("1,500–2,000 sq ft")
            page.locator('input[name="planAddon"][value="Inside oven"]').check()
            assert page.locator("#summaryExtras").inner_text() == "Inside oven", "Builder summary did not update"
            page.locator("#planQuote").click()
            assert page.locator("#service").input_value() == "Deep cleaning", "Service not carried to quote"
            assert page.locator("#frequency").input_value() == "Bi-weekly", "Frequency not carried to quote"
            assert "Bedrooms: 3" in page.locator("#details").input_value()
            assert "Inside oven" in page.locator("#details").input_value()
            page.locator("#planQuote").click()
            assert page.locator("#details").input_value().count("--- Cleaning brief ---") == 1, "Repeated planning duplicated notes"
            page.locator("#textRequest").click()
            assert "Please add your name and phone" in page.locator("#requestStatus").inner_text(), "Contact requirement missing"
            assert not errors, f"Browser JavaScript errors: {errors}"
            page.screenshot(path=str(output / f"{name}.png"), full_page=True, animations="disabled")
            checks.append(f"PASS {name}: no overflow, builder transfers safely, inquiry requires contact")
            page.close()
    finally:
        browser.close()

(output / "report.txt").write_text("\n".join(checks) + "\nNo quotes were booked or submitted. No private records were used.\n")
print("\n".join(checks))
