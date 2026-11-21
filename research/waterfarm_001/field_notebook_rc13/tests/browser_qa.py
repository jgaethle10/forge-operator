from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, tempfile
FILE=Path(__file__).resolve().parents[1]/'Evercraft_Aqua_Field_Notebook_RC13.html'
qa=FILE.parent/'qa';qa.mkdir(exist_ok=True)
report={'mobile':None,'desktop':None,'offline_requests':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,name in [(390,844,'mobile'),(1365,900,'desktop')]:
        context=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
        page=context.new_page(); req=[];errors=[]
        page.on('request',lambda r:req.append(r.url))
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(FILE.read_text())
        page.locator('#meterId').fill('WELL-A')
        page.locator('#units').select_option('L')
        page.locator('#start').click()
        assert not page.locator('#logPanel').is_hidden(), 'notebook did not show'
        for i in range(15):
            page.locator('#readDate').fill(f'2026-11-{i+1:02d}')
            page.locator('#readValue').fill(str(2000+i*125))
            if i>0:page.locator('#energyValue').fill('2.5')
            page.locator('#add').click()
            assert 'HOLD' not in page.locator('#message').inner_text(),(name,i,page.locator('#message').inner_text())
        assert '15' in page.locator('#progress').inner_text()
        assert page.locator('#exportAudit').is_enabled()
        assert not page.locator('#results').is_hidden()
        assert '1,750 L' in page.locator('#total').inner_text(),page.locator('#total').inner_text()
        with page.expect_download() as di:page.locator('#exportCsv').click()
        d=di.value;output=qa/(name+'_source.csv');d.save_as(output)
        assert output.read_text().startswith('date,meter_id')
        with page.expect_download() as di:page.locator('#exportAudit').click()
        d=di.value;out=qa/(name+'_audit.json');d.save_as(out)
        audit=json.loads(out.read_text());assert audit['interval_count']==14 and audit['water_savings_verified'] is False
        assert audit['source_integrity_sha256'] is not None
        with page.expect_download() as di:page.locator('#exportBackup').click()
        backup_file=qa/(name+'_backup.json')
        di.value.save_as(backup_file)
        # Corrupt the backup hash and ensure it does not overwrite the existing validated notebook.
        bad=json.loads(backup_file.read_text())
        bad['backup_sha256']='0'*64
        bad_file=qa/(name+'_bad_backup.json');bad_file.write_text(json.dumps(bad))
        page.locator('#backupFile').set_input_files(str(bad_file))
        expect(page.locator('#message')).to_contain_text('HOLD', timeout=5000)
        assert page.locator('#exportAudit').is_enabled()
        assert page.locator('#total').inner_text()=='1,750 L'
        page.screenshot(path=str(qa/(name+'_screenshot.png')),full_page=True)
        assert not errors, errors
        assert not any(url.startswith(('http://','https://')) for url in req),req
        width_data=page.evaluate('({scroll: document.documentElement.scrollWidth, view: innerWidth})')
        assert width_data['scroll']<=width_data['view'],width_data
        report[name]={'audited_l':audit['total_source_withdrawal_l'],'complete':True,'no_horizontal_overflow':True,'request_count':len(req)}
        report['offline_requests']+=req;report['errors']+=errors
        context.close()
    browser.close()
(qa/'browser_report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
