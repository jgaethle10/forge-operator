"""QA only. Run against Chromium at desktop and phone-width; not native Safari."""
from pathlib import Path
import json, hashlib, subprocess
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parent
source=(root/'Evercraft_Aqua_Baseline_RC11.html').read_text()
demo=subprocess.check_output(['node','--input-type=module','-e',"import {syntheticSample} from './app/core.mjs';process.stdout.write(syntheticSample())"],cwd=root,text=True)
valid=demo.replace('SYNTHETIC_SOURCE','TEST_METER_A').replace('SYNTHETIC_IRRIGATION','TEST_METER_B').replace('FICTIONAL_CALIBRATION','CAL_RECORD_REFERENCE_UNVERIFIED').replace('SYNTHETIC_DEMONSTRATION','ACTUAL_RECORDED_METER')
(root/'operator_supplied_TEST_ONLY.csv').write_text(valid)
(root/'invalid_NOT_A_CSV.txt').write_text('not a meter dataset')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for label,width,height in [('desktop',1365,900),('mobile',390,844)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=(label=='mobile'),has_touch=(label=='mobile'),accept_downloads=True)
        page=ctx.new_page()
        errors=[]; requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url) if not r.url.startswith('file:') else None)
        page.set_content(source,wait_until='load')
        page.get_by_role('button',name='Explore synthetic demo').click()
        expect(page.locator('#report')).to_be_visible()
        expect(page.locator('#sourceFingerprint')).to_contain_text(hashlib.sha256(demo.encode()).hexdigest())
        with page.expect_download() as d: page.get_by_role('button',name='Download audit JSON').click()
        d.value.save_as(root/(label+'_synthetic_audit.json'))
        data=json.loads((root/(label+'_synthetic_audit.json')).read_text())
        assert data['source_integrity_sha256']==hashlib.sha256(demo.encode()).hexdigest()
        assert data['evidence_state']=='SYNTHETIC_DEMONSTRATION'
        assert data['authorized_to_claim_leak'] is False
        page.locator('#fileInput').set_input_files(str(root/'operator_supplied_TEST_ONLY.csv'))
        expect(page.locator('#report')).to_be_visible()
        expect(page.locator('#sourceFingerprint')).to_contain_text(hashlib.sha256(valid.encode()).hexdigest())
        assert page.locator('#downloadReport').is_enabled()
        page.locator('#fileInput').set_input_files(str(root/'invalid_NOT_A_CSV.txt'))
        expect(page.locator('#status')).to_contain_text('HOLD:')
        assert page.locator('#report').is_hidden()
        assert page.locator('#downloadReport').is_disabled()
        assert page.locator('#sourceFingerprint').inner_text()==''
        # Invalid demo reimport cannot resurrect previous valid report.
        (root/'synthetic_DO_NOT_SUBMIT.csv').write_text(demo)
        page.locator('#fileInput').set_input_files(str(root/'synthetic_DO_NOT_SUBMIT.csv'))
        expect(page.locator('#status')).to_contain_text('HOLD:')
        assert page.locator('#report').is_hidden()
        page.get_by_role('button',name='Explore synthetic demo').click()
        expect(page.locator('#report')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert not errors,errors
        assert not requests,requests
        page.screenshot(path=str(root/(label+'_RC11.png')),full_page=True)
        print(label,'PASS: SHA-256 Python/JS parity, synthetic labels, valid input, invalid-file stale report cleared, controls disabled, no network/errors/overflow')
        ctx.close()
    browser.close()