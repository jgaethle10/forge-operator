from pathlib import Path
import json,sys,threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
path=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(path)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/Evercraft_Aqua_RC12_One_Meter_Field_Kit.html'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height,mode in [(390,844,'mobile'),(1365,900,'desktop')]:
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda request:external.append(request.url) if request.url.startswith(('http:','https:')) and not request.url.startswith(f'http://127.0.0.1:{server.server_port}/') else None)
  page.set_content((path/'Evercraft_Aqua_RC12_One_Meter_Field_Kit.html').read_text(),wait_until='load')
  assert page.locator('h1').inner_text().startswith('Measure first')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.locator('#demo').click()
  assert page.locator('#report').is_visible()
  assert 'SYNTHETIC' in page.locator('#reportState').inner_text()
  assert page.locator('#total').inner_text()=='13,250'
  with page.expect_download() as download_info:page.locator('#export').click()
  dl=download_info.value;f=path/'qa'/f'{mode}_demo_audit.json';dl.save_as(f)
  audit=json.loads(f.read_text());assert audit['evidence_state']=='SYNTHETIC_DEMONSTRATION'
  assert audit['total_source_withdrawal_l']==13250
  assert audit['water_savings_verified'] is False
  # A synthetic CSV re-imported by user must fail, clearing the previous report.
  page.locator('#analyze').click()
  assert not page.locator('#report').is_visible()
  assert page.locator('#export').is_disabled()
  assert 'HOLD' in page.locator('#status').inner_text()
  # Editing data holds the previous report; real operator test input is still unverified.
  head='date,meter_id,cumulative_reading,units,pump_kwh_since_previous,observation_kind\n'
  from datetime import date,timedelta
  raw=head+''.join(f'{(date(2025,2,1)+timedelta(days=i)).isoformat()},MTR_W01,{1000+i*120},US_GAL,{"" if i==0 else ""},OPERATOR_SUPPLIED_READING\n' for i in range(15))
  page.locator('#csv').fill(raw);page.locator('#analyze').click()
  assert page.locator('#report').is_visible()
  assert page.locator('#energy').inner_text()=='Unknown'
  assert page.locator('#reportState').inner_text()=='UNVERIFIED INPUT'
  # File chooser must load valid readings and reject synthetic files while clearing stale state.
  good=path/'qa'/f'{mode}_real_fixture.csv';good.write_text(raw)
  page.locator('#fileInput').set_input_files(str(good))
  assert page.locator('#report').is_visible()
  assert page.locator('#reportState').inner_text()=='UNVERIFIED INPUT'
  synthetic=path/'qa'/f'{mode}_synthetic_fixture.csv';synthetic.write_text('date,meter_id,cumulative_reading,units,pump_kwh_since_previous,observation_kind\n'+''.join(f'2025-01-{i:02},SYNTHETIC_A,{i*100},L,,SYNTHETIC_DEMONSTRATION\n' for i in range(1,16)))
  page.locator('#fileInput').set_input_files(str(synthetic))
  assert not page.locator('#report').is_visible()
  assert page.locator('#export').is_disabled()
  assert 'HOLD' in page.locator('#status').inner_text()
  page.locator('#csv').fill('bad')
  assert not page.locator('#report').is_visible()
  assert page.locator('#export').is_disabled()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.locator('#demo').click()
  page.screenshot(path=str(path/'qa'/f'{mode}_screen.png'),full_page=True)
  assert not external,external
  assert not errors,errors
  with page.expect_download() as dl_info:page.locator('#template').click()
  d=dl_info.value;v=path/'qa'/f'{mode}_blank_template.csv';d.save_as(v)
  assert v.read_text().splitlines()[0]=='date,meter_id,cumulative_reading,units,pump_kwh_since_previous,observation_kind'
  results.append({'mode':mode,'width':width,'errors':errors,'external_requests':external,'demo_total_l':audit['total_source_withdrawal_l'],'blank_template_rows':len(v.read_text().splitlines())-1,'status':'PASS'})
  page.close()
 browser.close()
server.shutdown()
print(json.dumps(results,indent=2))
