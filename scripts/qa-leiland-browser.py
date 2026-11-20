#!/usr/bin/env python3
"""Actual Chromium mobile/desktop QA of the FIRST-PARTY Leiland public files.

This is a local-only visual/interaction test, NOT a public deployment, not
private inference telemetry, and not proof of real KAIDANCE field cycles.
Browser-generated screenshots are saved as CI artifacts for human review.
"""
import json
import os
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"artifacts"/"leiland-browser"
OUTPUT.mkdir(parents=True,exist_ok=True)

class SilentPublicHandler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/"public"),**kwargs)
    def log_message(self,fmt,*args):
        pass

SERVER=ThreadingHTTPServer(("127.0.0.1",0),SilentPublicHandler)
THREAD=threading.Thread(target=SERVER.serve_forever,daemon=True)
THREAD.start()
ORIGIN=f"http://127.0.0.1:{SERVER.server_address[1]}"
LEILAND=ORIGIN+"/leiland/"

def canvas_metrics(page):
    return page.locator("#brain-canvas").evaluate("""el => {
      const ctx=el.getContext('2d'), w=el.width, h=el.height;
      if(!ctx || w<100 || h<100)return {width:w,height:h,visible:0,lit:0,checksum:0};
      const samples=ctx.getImageData(0,0,w,h).data;
      let visible=0,lit=0,hash=2166136261;
      // Stable spatial samples, no clipboard/analytics/third-party network.
      const sx=Math.max(1,Math.floor(w/84)),sy=Math.max(1,Math.floor(h/84));
      for(let y=0;y<h;y+=sy)for(let x=0;x<w;x+=sx){
        const k=(y*w+x)*4,r=samples[k],g=samples[k+1],b=samples[k+2];
        if(g>15 || b>20)visible++;
        if((b>60 && g>50) || (g>90 && r>60))lit++;
        hash=Math.imul(hash^(r+g*3+b*7+(x%13)*11),16777619);
      }
      return {width:w,height:h,visible,lit,checksum:hash>>>0};
    }""")

def inside_viewport(page, selector, tolerance=5):
    return page.locator(selector).evaluate("""(el,tol)=>{
      const r=el.getBoundingClientRect();
      return r.left>=-tol && r.right<=innerWidth+tol &&
        r.top>=-tol && r.bottom<=innerHeight+tol && r.width>0 && r.height>0;
    }""",tolerance)

try:
    binary=next((shutil.which(n) for n in
        ["google-chrome","google-chrome-stable","chromium","chromium-browser"]
        if shutil.which(n)),None)
    if not binary:
        raise RuntimeError("Chromium unavailable: browser QA cannot be declared passed.")
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(
            executable_path=binary,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        results=[]
        cases=[
            ("iphone",390,844,False),
            ("desktop",1365,900,False),
            ("iphone-reduced",390,844,True)
        ]
        for name,width,height,reduced in cases:
            context=browser.new_context(
                viewport={"width":width,"height":height},
                device_scale_factor=1,
                reduced_motion="reduce" if reduced else "no-preference")
            page=context.new_page()
            js_errors=[]
            page.on("pageerror",lambda exc:js_errors.append(str(exc)))
            # GitHub public history is optional: deliberately absent to prove
            # the visualization makes NO private runtime assumptions.
            page.route("https://api.github.com/**",lambda route:route.abort())
            response=page.goto(LEILAND,wait_until="domcontentloaded",timeout=20000)
            assert response and response.status==200,"Leiland source page did not load"
            page.wait_for_timeout(1050 if not reduced else 250)
            assert page.locator("canvas#brain-canvas").is_visible()
            assert page.locator("#status-lamp").count()==1
            assert page.locator("#collider-state").inner_text()=="Not connected",(
                "A missing public pulse must not be reported as a live heartbeat.")
            assert page.locator("#inference-state").inner_text()=="Unverified"
            assert "CONCEPTUAL ANIMATION" in page.locator("#visual-truth").inner_text()
            assert "NOT MODEL ACTIVATIONS" in page.locator("#visual-truth").inner_text()
            assert page.locator("button[data-region]").count()==5
            viewport=page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
            assert viewport["scroll"]<=viewport["width"]+3,(
                f"Horizontal overflow in {name}: {viewport}")
            frame1=canvas_metrics(page)
            assert frame1["width"]>100 and frame1["height"]>100,(
                f"Canvas zero-sized: {frame1}")
            assert frame1["lit"]>25 and frame1["visible"]>100,(
                f"Neural universe missing painted pixels: {frame1}")
            if not reduced:
                page.wait_for_timeout(850)
                frame2=canvas_metrics(page)
                assert frame1["checksum"]!=frame2["checksum"],(
                    f"Neural field not animating: {frame1} {frame2}")
            # Selecting a region in the actual artwork updates the accessible
            # architecture detail and mirrored selector, not merely its color.
            raven=page.locator("button[data-region='raven']")
            raven.click()
            assert page.locator("#system-name").inner_text()=="Raven Nexus"
            assert page.locator("#current-region").inner_text()=="RAVEN NEXUS"
            assert raven.get_attribute("aria-pressed")=="true"
            assert page.locator("button[data-system='raven']").get_attribute("aria-pressed")=="true"
            page.locator("button[data-system='passport']").click()
            assert page.locator("#current-region").inner_text()=="PASSPORT"
            assert page.locator("button[data-region='passport']").get_attribute("aria-pressed")=="true"
            for region in ["systemia","raven","saban","compute","passport"]:
                assert inside_viewport(page,"button[data-region='"+region+"']",130),(
                    f"Region pin unexpectedly outside the screen: {name} {region}")
            page.screenshot(path=str(OUTPUT/(name+"-main.png")),full_page=True)
            assert not js_errors,f"Uncaught browser JS errors in {name}: {js_errors}"
            if name=="iphone":
                page.locator("#broadcast").click()
                assert page.locator("body.broadcast").count()==1
                assert page.locator("#broadcast").get_attribute("aria-pressed")=="true"
                assert page.locator("#broadcast-exit").is_visible()
                page.wait_for_timeout(350)
                stage=page.locator("#brain-stage").bounding_box()
                assert stage and stage["height"]>height*.74,(
                    f"Portrait broadcast stage is too small: {stage}")
                assert page.locator("#visual-truth").is_visible()
                assert inside_viewport(page,"#broadcast-exit")
                page.screenshot(path=str(OUTPUT/"iphone-live.png"),full_page=False)
                page.locator("#broadcast-exit").click()
                assert page.locator("body.broadcast").count()==0
                page.goto(LEILAND+"?view=live",wait_until="domcontentloaded")
                assert page.locator("body.broadcast").count()==1,(
                    "Direct portrait broadcast share link failed")
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUTPUT/"iphone-shareable-live.png"),full_page=False)
                page.keyboard.press("Escape")
                assert page.locator("body.broadcast").count()==0,(
                    "Escape key did not exit portrait view")
            if reduced:
                # No animations or frame updates should be scheduled. Interactive
                # selection remains available without motion.
                first=canvas_metrics(page)
                page.wait_for_timeout(350)
                last=canvas_metrics(page)
                assert first["checksum"]==last["checksum"],(
                    "Reduced-motion stage moved without user interaction")
                assert page.locator("#current-region").inner_text()=="PASSPORT"
            assert not js_errors,f"Uncaught browser JS errors: {js_errors}"
            results.append({"case":name,"painted_pixels":frame1["lit"],
                "canvas_width":frame1["width"],"canvas_height":frame1["height"],
                "horizontal_overflow":False,"browser_errors":len(js_errors)})
            context.close()
        browser.close()
        print("LEILAND_BROWSER_QA_PASS "+json.dumps({"cases":results,
            "verified":"local_source_browser_only",
            "external_https_verified":False,
            "private_inference_verified":False}))
finally:
    SERVER.shutdown()
    SERVER.server_close()
    THREAD.join(timeout=3)
