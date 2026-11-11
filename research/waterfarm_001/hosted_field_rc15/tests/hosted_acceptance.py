"""Aqua RC15 hosted secure-context and offline integration smoke test."""
import http.server, socketserver, threading, tempfile, time, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from socket import socket

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
    def log_message(self,*a):pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        return super().end_headers()

with socket() as s:
    s.bind(('127.0.0.1',0));PORT=s.getsockname()[1]
server=socketserver.TCPServer(('127.0.0.1',PORT),Quiet)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{PORT}/'
report={'scenario':'RC15 first-party localhost secure-context simulation','checks':{},'errors':[],'network_external':[]}
with tempfile.TemporaryDirectory() as profile, sync_playwright() as p:
  def start():return p.chromium.launch_persistent_context(profile,headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'],viewport={'width':390,'height':844},accept_downloads=True,service_workers='allow')
  browser=start();page=browser.pages[0] if browser.pages else browser.new_page()
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('request',lambda r:report['network_external'].append(r.url) if not r.url.startswith(url) else None)
  page.goto(url,wait_until='networkidle')
  page.wait_for_timeout(750)
  print('storage',page.locator('#storageStatus').inner_text())
  report['checks']['secure_context']=page.evaluate('window.isSecureContext && indexedDB !== undefined')
  report['checks']['app_start_visible']=page.locator('#start').is_visible()
  page.locator('#meterId').fill('WELL-01')
  page.locator('#start').click()
  page.wait_for_function("document.querySelector('#logPanel')?.hidden === false")
  page.wait_for_function("document.querySelector('#storageStatus')?.innerText?.includes('saved')")
  # 15 records with no energy
  for i in range(15):
    dt=(__import__('datetime').date(2026,10,1)+__import__('datetime').timedelta(days=i)).isoformat()
    page.locator('#readDate').fill(dt)
    page.locator('#readValue').fill(str(1000+i*100))
    page.locator('#add').click()
    page.wait_for_function("n=>document.querySelector('#progress')?.innerText?.startsWith(String(n))",i+1)
  report['checks']['fifteen_readings']=page.locator('#progress').inner_text().startswith('15')
  report['checks']['audit_ready']=page.locator('#results').is_visible()
  report['checks']['audit_disabled_false']=page.locator('#exportAudit').is_enabled()
  with page.expect_download() as saved:
    page.locator('#exportBackup').click()
  b=saved.value
  backup=Path(profile)/'out.json';b.save_as(backup)
  dat=json.loads(backup.read_text())
  report['checks']['backup_record_count']=len(dat['records'])==15
  report['checks']['audit_no_real_claim']=dat['evidence_state']=='OPERATOR_SUPPLIED_UNVERIFIED'
  # save a screenshot as evidence
  page.screenshot(path=str(ROOT/'qa'/'mobile_rc15.png'),full_page=True)
  report['checks']['no_phone_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  browser.close()
  # persistent context reopen uses the SAME IndexedDB, no manual backup
  browser=start();page=browser.pages[0] if browser.pages else browser.new_page()
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(url,wait_until='networkidle')
  page.wait_for_function("document.querySelector('#progress')?.innerText?.startsWith('15')")
  report['checks']['database_survived_restart']=page.locator('#progress').inner_text().startswith('15')
  # simulate offline within a registered service worker and verify static shell opens
  page.wait_for_timeout(1250)
  sw=page.evaluate("async()=>{await navigator.serviceWorker.ready;return Boolean(navigator.serviceWorker.controller)}")
  if not sw:
      page.reload(wait_until='networkidle')
      sw=page.evaluate('Boolean(navigator.serviceWorker.controller)')
  report['checks']['sw_controls_page']=sw
  browser.set_offline(True)
  offline=browser.new_page()
  try:
    offline.goto(url,wait_until='domcontentloaded',timeout=10000)
    offline.wait_for_function("document.querySelector('#progress')?.innerText?.startsWith('15')",timeout=8000)
    report['checks']['offline_restart']=True
  except Exception as e:
    report['checks']['offline_restart']=False
    report['errors'].append(str(e))
  browser.set_offline(False)
  offline.close()
  # tampered backup must not displace existing 15-record source
  bad=json.loads(backup.read_text());bad['records'][-1]['reading']='99999'
  page.locator('#pasteBackupText').click()
  page.locator('#backupText').fill(json.dumps(bad))
  page.locator('#restorePastedBackup').click()
  page.wait_for_timeout(300)
  report['checks']['tampered_backup_blocks']=page.locator('#progress').inner_text().startswith('15') and 'HOLD' in page.locator('#message').inner_text()
  browser.close()
server.shutdown();server.server_close()
Path(ROOT/'qa'/'browser_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
assert all(report['checks'].values()),'browser check failed'
assert not report['errors'] and not report['network_external']
