#!/usr/bin/env python3
"""Run real mobile/desktop browser acceptance against the owned static files.
No private pulse or synthetic GitHub events are injected into the page.
"""
import os
import shutil
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"artifacts"/"kaidance-browser"
OUTPUT.mkdir(parents=True,exist_ok=True)
PORT=8792
HOST=f"http://127.0.0.1:{PORT}/kaidance/"
SERVER=subprocess.Popen(
 ["python3","-m","http.server",str(PORT),"--bind","127.0.0.1","--directory",str(ROOT/"public")],
 stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL
)
try:
 for _ in range(50):
  try:
   with urlopen(HOST,timeout=1) as response:
    if response.status==200:break
  except Exception:time.sleep(.1)
 else:raise RuntimeError("static viewer server did not start")
 binary=next((shutil.which(n) for n in ["google-chrome","google-chrome-stable","chromium","chromium-browser"] if shutil.which(n)),None)
 if not binary:raise RuntimeError("CI browser runtime missing")
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(executable_path=binary,headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
  for name,width,height in [("iphone",390,844),("desktop",1365,900)]:
   page=browser.new_page(viewport={"width":width,"height":height},device_scale_factor=1)
   errors=[]
   page.on("pageerror",lambda exc:errors.append(str(exc)))
   page.goto(HOST,wait_until="domcontentloaded",timeout=15000)
   page.wait_for_timeout(1500)
   assert page.locator("#portraitBtn").is_visible(),"broadcast action not in top bar"
   assert page.locator("#heroEventTitle").count()==1
   assert page.locator("#visualField").count()==1
   assert page.locator("#colliderField").count()==1
   assert page.locator("#colliderField").is_visible()
   reactor=page.locator("#colliderField").evaluate("""el=>{
     const c=el.getContext('2d');
     if(!c)return {pixels:0,bright:0};
     const s=c.getImageData(0,0,el.width,el.height).data;
     let pixels=0,bright=0;
     for(let i=0;i<s.length;i+=16*4){
       if(s[i+3]>0)pixels++;
       if(s[i]>30 && s[i+1]>55 && s[i+2]>75 && s[i+3]>20)bright++;
     }
     return {pixels,bright};
   }""")
   assert reactor["pixels"]>150 and reactor["bright"]>40,f"Collider canvas blank or invisible: {reactor}"

   assert page.locator("#statusBadge").inner_text().strip(),"source status missing"
   geometry=page.evaluate("({screen:innerWidth,scroll:document.documentElement.scrollWidth})")
   assert geometry["scroll"]<=geometry["screen"]+3,f"horizontal page overflow: {geometry}"
   assert not errors,f"browser JS errors: {errors}"
   page.screenshot(path=str(OUTPUT/(name+".png")),full_page=True)
   if name=="desktop":
    def sample_reactor():
     return page.locator("#colliderField").evaluate("""el=>{
       const c=el.getContext('2d'), w=el.width,h=el.height;
       let hash=2166136261;
       for(let k=0;k<24;k++){
         const x=Math.max(0,Math.min(w-6,Math.floor(w*(.2+.6*((k*7)%24)/24))));
         const y=Math.max(0,Math.min(h-6,Math.floor(h*(.17+.5*((k*11)%24)/24))));
         const data=c.getImageData(x,y,6,6).data;
         for(let j=0;j<data.length;j+=4){
           hash=Math.imul(hash^data[j],16777619);
           hash=Math.imul(hash^data[j+1],16777619);
           hash=Math.imul(hash^data[j+2],16777619);
         }
       }
       return hash>>>0;
     }""")
    before=sample_reactor()
    page.wait_for_timeout(850)
    after=sample_reactor()
    assert before!=after,"Collider renderer should animate, not remain a static picture"
    page.screenshot(path=str(OUTPUT/"desktop-collider.png"),full_page=False)
   if name=="iphone":
    headline=page.locator("#heroEventTitle").bounding_box()
    assert headline and headline["y"]<height-40,f"first-screen activity still buried: {headline}"
    stage=page.locator("#stage").bounding_box()
    assert stage
    for selector in [".orbit-label-2",".orbit-label-4"]:
     label=page.locator(selector).bounding_box()
     assert label and label["x"]>=stage["x"]-1 and label["x"]+label["width"]<=stage["x"]+stage["width"]+1, f"clipped network label: {selector} {label}"

    page.locator("#portraitBtn").click()
    assert page.locator("body.portrait").count()==1
    assert page.locator("#portraitEventTitle").is_visible()
    assert page.locator("#portraitBtn").inner_text().strip().endswith("EXIT LIVE VIEW")
    exit_color=page.locator("#portraitBtn").evaluate("(el)=>getComputedStyle(el).backgroundColor")
    assert exit_color=="rgb(9, 35, 53)",f"broadcast exit button lost contrast: {exit_color}"
    page.screenshot(path=str(OUTPUT/"iphone-live.png"),full_page=False)
    page.goto(HOST+"?view=live",wait_until="domcontentloaded",timeout=15000)
    assert page.locator("body.portrait").count()==1,"shareable live view not applied"
    page.wait_for_timeout(1200)
    for selector in [".orbit-label-2",".orbit-label-4"]:
     label=page.locator(selector).bounding_box()
     assert label and label["x"]>=-1 and label["x"]+label["width"]<=width+1, f"clipped broadcast label: {selector} {label}"
    page.screenshot(path=str(OUTPUT/"iphone-direct-live.png"),full_page=False)
   page.close()
  browser.close()
 print("KAIDANCE_BROWSER_QA_PASS: responsive desktop, iPhone, one-tap broadcast, direct live view, no errors or horizontal overflow")
finally:
 SERVER.terminate()
 try:SERVER.wait(timeout=3)
 except subprocess.TimeoutExpired:SERVER.kill()
