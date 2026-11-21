import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parent
url=(root/'Evercraft_Aqua_Baseline_RC10.html').as_uri()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for kind,w,h in [('desktop',1365,900),('iphone',390,844)]:
  context=browser.new_context(viewport={'width':w,'height':h},accept_downloads=True,is_mobile=kind=='iphone',has_touch=kind=='iphone',device_scale_factor=1)
  page=context.new_page()
  exceptions=[];external=[]
  page.on('pageerror',lambda e:exceptions.append(str(e)))
  page.on('request',lambda r:external.append(r.url) if not r.url.startswith('file:') else None)
  page.set_content((root/'Evercraft_Aqua_Baseline_RC10.html').read_text(),wait_until='load')
  page.get_by_role('button',name='Explore synthetic demo').click()
  assert page.locator('#report').is_visible()
  assert page.locator('#reportTitle').inner_text()=='Synthetic example report'
  assert page.locator('#evidenceTag').inner_text()=='SYNTHETIC DEMO'
  with page.expect_download() as d:
   page.get_by_role('button',name='Download audit JSON').click()
  filename=d.value.suggested_filename
  d.value.save_as(root/(kind+'_audit.json'))
  report=json.loads((root/(kind+'_audit.json')).read_text())
  assert report['evidence_state']=='SYNTHETIC_DEMONSTRATION'
  assert report['source_kind']=='SYNTHETIC_DEMONSTRATION'
  assert report['authorized_to_claim_savings'] is False
  assert report['source_inlet_l']==14000
  # Direct user-upload of downloaded/sample demo bytes fails, rather than being promoted.
  import subprocess
  samples=subprocess.run(['node','--input-type=module','-e',
    "import {syntheticSample} from './app/core.mjs';process.stdout.write(syntheticSample())"],cwd=str(root),capture_output=True,text=True,check=True)
  demo_file=root/'synthetic_demo_DO_NOT_SUBMIT.csv';demo_file.write_text(samples.stdout)
  page.locator('#fileInput').set_input_files(str(demo_file))
  expect(page.locator('#status')).to_contain_text('HOLD:')
  assert 'HOLD:' in page.locator('#status').inner_text()
  assert not page.locator('#report').is_visible()
  # A manually relabeled but obviously synthetic source must also fail.
  tampered=root/'synthetic_mislabeled_DO_NOT_SUBMIT.csv'
  tampered.write_text(samples.stdout.replace('SYNTHETIC_DEMONSTRATION','ACTUAL_RECORDED_METER'))
  page.locator('#fileInput').set_input_files(str(tampered))
  expect(page.locator('#status')).to_contain_text('demo identifiers')
  assert 'demo identifiers' in page.locator('#status').inner_text()
  assert not page.locator('#report').is_visible()
  # Reload demo for visual inspection.
  page.get_by_role('button',name='Explore synthetic demo').click()
  assert not exceptions,exceptions
  assert not external,external
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  page.screenshot(path=str(root/(kind+'_RC10.png')),full_page=True)
  print(kind,'PASS: demo and export synthetic; reimport HOLD; mislabeled HOLD; no JS or network; no overflow',filename)
  context.close()
 browser.close()