from pathlib import Path
from playwright.sync_api import sync_playwright
html=Path('/mnt/data/Evercraft_Aqua_Baseline_RC09.html').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for device,width,height in [('desktop',1365,850),('iphone',390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=device=='iphone',has_touch=device=='iphone')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        requests=[];page.on('request',lambda r: requests.append(r.url))
        page.set_content(html,wait_until="load")
        page.get_by_role('button',name='Explore synthetic demo').click()
        page.locator('#report').wait_for(state='visible')
        assert page.locator('#metricSource').inner_text()=='14,000'
        assert page.locator('#metricIrrigation').inner_text()=='13,300'
        assert page.locator('#reportTitle').inner_text()=='Synthetic example report'
        assert not errors,errors
        assert all(u.startswith('file:') for u in requests),requests
        with page.expect_download(timeout=4000) as download_info:page.get_by_role('button',name='Download audit JSON').click()
        dl=download_info.value;assert dl.suggested_filename.endswith('.json')
        with page.expect_download(timeout=4000) as template_info:page.get_by_role('button',name='Download CSV template').click()
        assert template_info.value.suggested_filename.endswith('.csv')
        if device=='iphone':
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'horizontal overflow on phone'
        page.screenshot(path=f'/mnt/data/aqua_rc09/RC09_{device}.png',full_page=True)
        print(device,'OK, errors',len(errors),'requests',requests,'screenshot',page.locator('#report').is_visible())
        page.close()
    browser.close()