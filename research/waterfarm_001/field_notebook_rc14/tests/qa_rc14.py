from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'Evercraft_Aqua_Field_Notebook_RC14.html'
QA=ROOT/'qa';QA.mkdir(exist_ok=True)
report={}
with sync_playwright() as p:
 for engine in ('chromium','webkit'):
  if engine=='webkit':
   browser_type=p.webkit
  else:
   browser_type=p.chromium
  try:
   browser=browser_type.launch(headless=True,executable_path='/usr/bin/chromium' if engine=='chromium' else None,args=['--no-sandbox'] if engine=='chromium' else [])
  except Exception as exc:
   report[engine]={'not_run':str(exc)[:500]}
   continue
  for width,height,label in [(390,844,'phone'),(1365,900,'desktop')]:
   context=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
   page=context.new_page();errs=[];req=[]
   page.on('pageerror',lambda e:errs.append(str(e)))
   page.on('request',lambda r:req.append(r.url))
   page.set_content(HTML.read_text())
   start=page.locator('#start').bounding_box()
   assert start and start['y']+start['height']<height*1.12,(engine,label,start)
   if label=='phone':page.screenshot(path=str(QA/f'{engine}_phone_start.png'))
   page.locator('#meterId').fill('WELL-A');page.locator('#units').select_option('US_GAL');page.locator('#start').click()
   for i in range(15):
    page.locator('#readDate').fill(f'2026-10-{i+1:02d}');page.locator('#readValue').fill(str(1000+i*100))
    if i:page.locator('#energyValue').fill('1.4')
    page.locator('#add').click()
    assert 'HOLD' not in page.locator('#message').inner_text(),(i,page.locator('#message').inner_text())
   assert page.locator('#exportAudit').is_enabled()
   assert not page.locator('#results').is_hidden()
   # The text backup is visible, select-able, and not an upload
   page.locator('#showBackupText').click()
   assert not page.locator('#backupTextPanel').is_hidden()
   backup=page.locator('#backupText').input_value()
   backup_obj=json.loads(backup)
   assert len(backup_obj['records'])==15
   assert len(backup_obj['backup_sha256'])==64
   page.locator('#copyBackupText').click()
   expect(page.locator('#message')).to_contain_text('backup text')
   # close and restore by pasted JSON: replace current notebook, then confirm no data change
   page.locator('#closeBackupText').click()
   page.locator('#pasteBackupText').click()
   assert page.locator('#backupText').input_value()==''
   page.locator('#backupText').fill(backup.replace('"backup_sha256": "','"backup_sha256": "000'))
   page.locator('#restorePastedBackup').click()
   expect(page.locator('#message')).to_contain_text('HOLD')
   assert page.locator('#progress').inner_text().startswith('15')
   assert page.locator('#exportAudit').is_enabled()
   # reset (without carrying old data) and restore via pasted backup, no confirm needed
   page.locator('#backupText').fill(backup)
   page.once('dialog',lambda d:d.accept())
   page.locator('#restorePastedBackup').click()
   expect(page.locator('#message')).to_contain_text('Validated backup restored')
   assert page.locator('#progress').inner_text().startswith('15')
   assert page.locator('#exportAudit').is_enabled()
   # Future dates should not be accepted as observed readings
   page.locator('#readDate').fill('2099-01-01')
   page.locator('#readValue').fill('4000')
   page.locator('#add').click()
   expect(page.locator('#message')).to_contain_text('Future dates')
   assert page.locator('#progress').inner_text().startswith('15')
   with page.expect_download() as di:page.locator('#exportAudit').click()
   audit=json.loads(di.value.path().read_text())
   assert audit['water_savings_verified'] is False
   assert audit['interval_count']==14
   # New, empty preview context: recovery must be available BEFORE starting a notebook.
   restored=context.new_page()
   restored.set_content(HTML.read_text())
   # isolate the new session from the working page's local saved data
   restored.evaluate("try { localStorage.removeItem('evercraft-aqua-field-notebook-v1') } catch(e) {}")
   restored.reload() if False else None
   # fresh page whose UI never had a notebook, as a lost-preview session would appear
   restored.set_content(HTML.read_text())
   assert not restored.locator('#startPanel').is_hidden()
   assert restored.locator('#startRestoreText').is_visible()
   restored.locator('#startRestoreText').click()
   restored.locator('#startBackupText').fill(backup.replace('"backup_sha256": "','"backup_sha256": "xyz'))
   restored.locator('#startApplyBackup').click()
   expect(restored.locator('#message')).to_contain_text('HOLD')
   assert not restored.locator('#startPanel').is_hidden(), 'invalid startup backup started a notebook'
   restored.locator('#startBackupText').fill(backup)
   restored.locator('#startApplyBackup').click()
   expect(restored.locator('#message')).to_contain_text('Backup restored')
   assert restored.locator('#startPanel').is_hidden()
   assert restored.locator('#progress').inner_text().startswith('15')
   assert restored.locator('#exportAudit').is_enabled()
   restored.close()
   # New empty-preview session also recovers from a JSON *file*, not just paste.
   imported=context.new_page()
   imported.set_content(HTML.read_text())
   assert imported.locator('#startPanel').is_visible()
   import_file=QA/'start_restore_good.json'
   import_file.write_text(backup)
   imported.locator('#startBackupFile').set_input_files(str(import_file))
   expect(imported.locator('#message')).to_contain_text('Backup restored')
   assert imported.locator('#progress').inner_text().startswith('15')
   imported.close()
   qa_file=QA/f'{engine}_{label}_backup.png'
   page.screenshot(path=str(qa_file),full_page=False)
   assert not errs,errs
   assert not any(u.startswith(('http://','https://')) for u in req),req
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
   report[f'{engine}_{label}']={'pass':True,'start_button_bottom':round(start['y']+start['height'],1),'viewport_h':height,'reading_count':15,'audit_interval_count':audit['interval_count'],'network_requests':len(req),'errors':errs}
   context.close()
  browser.close()
(QA/'rc14_report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
