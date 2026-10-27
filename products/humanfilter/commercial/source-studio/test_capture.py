import pathlib, json, zipfile, tempfile, subprocess, time
from playwright.sync_api import sync_playwright
from ingest_live_action import ingest
base=pathlib.Path(__file__).resolve().parent
sample=base/'demo-only-testsrc.mp4'
server=subprocess.Popen(['python','-m','http.server','8765','--bind','127.0.0.1','--directory',str(base)], stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 time.sleep(.7)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
  page=context.new_page()
  page.goto('http://127.0.0.1:8765/mobile-capture.html')
  print('browser loaded',page.title())
  assert page.locator('h1').inner_text()=='Film the real story.'
  assert page.locator('article.shot').count()==4
  assert page.locator('#export').is_disabled()
  page.locator('article.shot').nth(0).locator('input[type=file]').nth(1).set_input_files(str(sample))
  assert page.locator('#count').inner_text()=='1'
  assert page.locator('#export').is_disabled()
  page.locator('#rights').check()
  with page.expect_download(timeout=20000) as d:
   page.locator('#export').click()
  download=d.value
  with tempfile.TemporaryDirectory() as tmp:
   target=pathlib.Path(tmp)/download.suggested_filename
   download.save_as(target)
   with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    names=z.namelist(); assert names==['intake-manifest.json','footage/wide.mp4'],names
    manifest=json.loads(z.read('intake-manifest.json'))
    assert manifest['rights_attested'] and manifest['consent_attested']
    assert manifest['publication_authority'] is False
    assert manifest['files'][0]['shot_id']=='wide'
    assert len(z.read('footage/wide.mp4'))==sample.stat().st_size
   receipt=ingest(target,pathlib.Path(tmp)/'ingested')
   assert receipt['status']=='TECHNICAL_ACCEPTED_HUMAN_VISUAL_REVIEW_REQUIRED'
   assert receipt['publication_authority'] is False
   assert receipt['missing_shots']==['hands','reaction','hero']
   assert len(receipt['sources'][0]['sampled_frames'])==3
   print(json.dumps({'browser':'PASS','zip':'PASS','ffprobe':'PASS','frame_evidence':'PASS','release':'BLOCKED','source_count':1},indent=2))
  browser.close()
finally:
 server.terminate();server.wait(timeout=3)