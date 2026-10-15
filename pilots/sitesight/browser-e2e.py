"""Real Chromium click/export/CLI test of the OFFLINE, fictional SiteSight pilot.

This tests browser behavior and JSON consistency, not actual PPE detection.
Run: python pilots/sitesight/browser-e2e.py
Requires: pip install playwright && python -m playwright install chromium
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = ROOT / 'evercraft_ppe_safety_internal_demo.html'
VERIFY = ROOT / 'verify-export.mjs'


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def run_cli(path):
    return subprocess.run(
        ['node', str(VERIFY), str(path)],
        cwd=ROOT.parent.parent,
        text=True, capture_output=True, check=False, timeout=15,
    )


with sync_playwright() as playwright, tempfile.TemporaryDirectory() as scratch:
    exe = os.getenv('SITESIGHT_BROWSER_EXECUTABLE')
    options = {'headless': True, 'args': ['--no-sandbox']}
    if exe:
        options['executable_path'] = exe
    browser = playwright.chromium.launch(**options)
    try:
        page = browser.new_page(
            accept_downloads=True, viewport={'width': 390, 'height': 844},
            device_scale_factor=1
        )
        js_errors = []
        page.on('pageerror', lambda error: js_errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        page.set_content(HTML.read_text(encoding='utf-8'), wait_until='load')
        check('SiteSight' in page.title(), 'SiteSight UI never mounted')
        check(page.locator('#nOpen').inner_text() == '2', 'arrival candidates missing')

        # Deliberate false-positive dismissal, followed by a reviewer closeout.
        page.locator('[data-act="dismiss"][data-id="A1"]').click()
        page.locator('[data-act="verify"][data-id="A2"]').click()
        page.locator('#actionNote').fill(
            'Illustrative supervisor supplied a vest and visually confirmed the correction.'
        )
        page.locator('#closeAction').click()
        check(page.locator('#nClosed').inner_text() == '1', 'closeout counter wrong')
        check(page.locator('#nDismissed').inner_text() == '1', 'dismissal counter wrong')

        with page.expect_download() as info:
            page.locator('#export').click()
        first = Path(scratch) / 'completed.json'
        info.value.save_as(str(first))
        data = json.loads(first.read_text(encoding='utf-8'))
        check(
            {(item['id'], item['status']) for item in data['items']}
            == {('A1', 'dismissed'), ('A2', 'closed')},
            'Export does not match human review decisions'
        )
        check(
            [e['action'] for e in data['events']]
            == ['demo_reset', 'human_dismissed', 'human_verified', 'corrective_action_closed'],
            'Exported event chronology is incorrect'
        )
        check(all('person' not in i for i in data['items']), 'unexpected identity export')
        checked = run_cli(first)
        check(checked.returncode == 0, f'CLI rejected actual browser export: {checked.stdout}\n{checked.stderr}')
        receipt = json.loads(checked.stdout)
        check(receipt['ok'] is True, 'invalid browser export')
        check(receipt['authenticated'] is False, 'synthetic export was misrepresented as authenticated')
        check(receipt['detection'] == 'not_connected', 'model connection was falsely asserted')

        # A changed assertion with no corresponding history must be rejected.
        data['items'][0]['status'] = 'closed'
        corrupted = Path(scratch) / 'corrupted.json'
        corrupted.write_text(json.dumps(data), encoding='utf-8')
        tampered = run_cli(corrupted)
        check(tampered.returncode == 1, 'Contradictory synthetic export was accepted')
        check(not json.loads(tampered.stdout)['ok'], 'Tampering was not reported')

        # Unknown/occluded frames must not offer visual verification.
        page.locator('#scenario').select_option('poor')
        check(page.locator('[data-act="verify"]').count() == 0, 'Unknown PPE could be visually approved')
        check(page.locator('button:disabled').count() >= 2, 'Manual inspection warning control missing')
        with page.expect_download() as info:
            page.locator('#export').click()
        poor = Path(scratch) / 'occluded.json'
        info.value.save_as(str(poor))
        unclear = json.loads(poor.read_text(encoding='utf-8'))
        check(
            all(item['status'] == 'pending' and item['confidence'] == 'unknown'
                for item in unclear['items']),
            'Unknown PPE was silently promoted to a confirmed violation'
        )
        check(run_cli(poor).returncode == 0, 'Valid pending poor-visibility export was rejected')
        check(not js_errors, 'Browser errors: ' + ', '.join(js_errors))
        print(json.dumps({
            'result': 'PASS', 'mode': 'synthetic_only',
            'checks': ['dismissal', 'verification', 'human_closeout', 'browser_json_export',
                       'node_evidence_validator', 'event_tamper_rejection',
                       'occlusion_gate', 'browser_errors'],
            'customer_ready': False, 'live_ppe_model': False,
            'systemia_admitted': False, 'checkout_connected': False,
        }, indent=2))
    finally:
        browser.close()
