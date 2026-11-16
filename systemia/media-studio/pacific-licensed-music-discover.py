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

# Download only these three individually identified licensed music records for private editorial auditions.
# The video editor must not publish stand-alone music files or claim ownership.
graph_nodes=[]
def walk(obj):
    if isinstance(obj,dict):
        if obj.get('@type')=='MusicRecording': graph_nodes.append(obj)
        for v in obj.values(): walk(v)
    elif isinstance(obj,list):
        for v in obj: walk(v)
for node in soup.select('script[type="application/ld+json"]'):
    try:
        walk(json.loads(node.string or node.get_text()))
    except Exception:
        pass
print('OFFICIAL_RECORDS',len(graph_nodes),[x.get('name') for x in graph_nodes if x.get('name') in TARGETS])
for name in TARGETS:
    rec=next((x for x in graph_nodes if x.get('@type')=='MusicRecording' and x.get('name')==name),None)
    if not rec:
        raise RuntimeError('Missing official MusicRecording license metadata: '+name)
    url=rec.get('url','')
    if not re.fullmatch(r'https://assets\.mixkit\.co/music/(\d+)/\1\.mp3',url):
        raise RuntimeError('Unexpected recording URL: '+url)
    if rec.get('license')!='https://mixkit.co/license/#musicFree':
        raise RuntimeError('Missing verified Mixkit Stock Music Free License: '+name)
    audio=fetch(url,15_000_000)
    if len(audio)<100_000 or not (audio[:3]==b'ID3' or (audio[0]==255 and audio[1]&224==224)):
        raise RuntimeError('Missing authentic MP3 audio for '+name)
    fname=name.lower().replace(' ','_')+'.mp3'
    (OUT/fname).write_bytes(audio)
    entry={'title':name,'composer':rec['byArtist'],'source_url':url,'catalog_page':PAGE,'license_url':LICENSE,
           'bytes':len(audio),'sha256':hashlib.sha256(audio).hexdigest(),'file':fname,
           'usage':'private commercial audiovisual editing review; no standalone audio redistribution'}
    result['downloaded'].append(entry)
    print('RECORDING',json.dumps(entry))

print(json.dumps(result,indent=2)[:11000])
(OUT/'discovery.json').write_text(json.dumps(result,indent=2))
