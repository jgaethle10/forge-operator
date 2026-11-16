#!/usr/bin/env python3
"""Discover a single properly licensed Mixkit music recording for Pacific private audition.
No client media and no mass downloading. Keep licensing and provider provenance.
"""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from html import unescape
import re,json,hashlib,subprocess,sys
from bs4 import BeautifulSoup

OUT=Path('pacific-licensed-music-private');OUT.mkdir(exist_ok=True)
PAGE='https://mixkit.co/free-stock-music/rock/'
LICENSE='https://mixkit.co/license/modal/musicFree/'
TARGETS=['Caught on Tape','Mada','Sports Rock']
def fetch(url,limit=10_000_000):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; EvercraftCommercialStudio/1.0; authorized single-track edit)'})
    with urlopen(req,timeout=35) as r:
        content=r.read(limit+1)
        if len(content)>limit: raise ValueError('asset too large')
        return content

raw=fetch(PAGE,4_000_000)
html=raw.decode('utf-8',errors='replace')
(OUT/'page-sha256.txt').write_text(hashlib.sha256(raw).hexdigest()+"\n")
soup=BeautifulSoup(html,'html.parser')
result={'source_page':PAGE,'license':LICENSE,'page_sha256':hashlib.sha256(raw).hexdigest(),'downloaded':[],'page_bytes':len(raw),'targets':{}}
for name in TARGETS:
    m=re.search(re.escape(name),html,re.I)
    w=html[max(0,m.start()-2500):m.start()+4500] if m else ''
    (OUT/('source_window_'+name.lower().replace(' ','_')+'.txt')).write_text(w)
    # Track id and download/preview source must occur locally near this title.
    all_ids=re.findall(r'(?:music[/=]|asset(?:_|-)?id[\"\':= ]+|data-id[\"\':= ]+|/music/)(\d{1,6})',w,re.I)
    src=re.findall(r'((?:https?:)?//[^\s\"\']+\.(?:mp3|wav)(?:\?[^\s\"\']*)?)',w,re.I)
    n=soup.find(string=lambda x:isinstance(x,str) and name.lower() in x.lower())
    parents=[]
    if n:
        p=n.parent
        for i in range(5):
            if not p:break
            parents.append({'tag':p.name,'attrs':{k:str(v)[:180] for k,v in p.attrs.items()},'snippet':p.get_text(' ',strip=True)[:160]})
            p=p.parent
    result['targets'][name]={'found':bool(m),'nearby_ids':all_ids[:15],'nearby_media':src[:10],'parents':parents}
print(json.dumps(result,indent=2)[:11000])
(OUT/'discovery.json').write_text(json.dumps(result,indent=2))
