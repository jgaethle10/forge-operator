#!/usr/bin/env python3
"""READ-ONLY deployment verifier, never a publisher or field certification.

Usage (ONLY after authorized first-party hosting):
 python verify_hosted.py --url https://APPROVED-HOST/aqua/ --expected-host APPROVED-HOST

No credentials/cookies/recorded readings are sent. Reject redirects and foreign
hosts. Exact static SHA256 match to the locally built release manifest required.
"""
import argparse,hashlib,json,ssl,sys
from pathlib import Path
from urllib.parse import urlparse,urljoin
from urllib.request import build_opener,HTTPRedirectHandler,HTTPSHandler,Request
from urllib.error import HTTPError,URLError

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'RC17_RELEASE_SHA256.json'
MAX_BYTES=2_000_000
class ReleaseHold(ValueError):pass
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ReleaseHold('redirect disallowed; verify origin')

def validate_origin(url,expected_host):
    u=urlparse(url)
    if not isinstance(expected_host,str) or not expected_host or not expected_host.isascii():raise ReleaseHold('explicit expected host required')
    if u.scheme!='https' or u.hostname!=expected_host or u.username or u.password or u.query or u.fragment or u.port not in (None,443):
        raise ReleaseHold('origin must be exact approved HTTPS host with no query or credentials')
    if not u.path.endswith('/') or u.path=='/':raise ReleaseHold('app must have explicit isolated path ending in /')
    return url

def get_bytes(url,opener=None):
    if opener is None:opener=build_opener(NoRedirect(),HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(Request(url,headers={'User-Agent':'Evercraft-Aqua-RC17-ReadOnlyAcceptance/1','Accept':'*/*'}),timeout=15) as response:
            if response.status!=200 or response.url!=url:raise ReleaseHold('unexpected response / redirect')
            raw=response.read(MAX_BYTES+1)
            if len(raw)>MAX_BYTES:raise ReleaseHold('static response unexpectedly large')
            return raw,{k.lower():v for k,v in response.headers.items()}
    except (HTTPError,URLError,OSError) as e:raise ReleaseHold('hosted HTTPS retrieval unavailable: '+str(e)[:120]) from e

def verify(url,expected_host,fetch=get_bytes,manifest=None):
    validate_origin(url,expected_host)
    manifest=manifest or json.loads(MANIFEST.read_text())
    errors=[];seen={}
    for path,item in manifest['assets'].items():
        target=urljoin(url,path)
        try:
            if urlparse(target).hostname!=expected_host or not target.startswith(url):raise ReleaseHold('out of scope URL')
            raw,headers=fetch(target)
            digest=hashlib.sha256(raw).hexdigest()
            if digest!=item['sha256']:raise ReleaseHold('SHA256 mismatch')
            if len(raw)!=item['bytes']:raise ReleaseHold('file size mismatch')
            mime=headers.get('content-type','').split(';')[0].lower()
            if path.endswith('.js') or path.endswith('.mjs'):
                if mime not in ('application/javascript','text/javascript'):raise ReleaseHold('incorrect JS MIME')
            if path.endswith('.webmanifest') and mime not in ('application/manifest+json','application/json'):raise ReleaseHold('incorrect manifest MIME')
            if path.endswith('.png') and mime!='image/png':raise ReleaseHold('incorrect PNG MIME')
            if path.endswith('.html') and mime!='text/html':raise ReleaseHold('incorrect HTML MIME')
            if headers.get('x-content-type-options','').lower()!='nosniff':raise ReleaseHold('missing nosniff')
            if headers.get('referrer-policy','').lower()!='no-referrer':raise ReleaseHold('missing referrer policy')
            csp=headers.get('content-security-policy','')
            for required in ("default-src 'none'","connect-src 'none'","worker-src 'self'"):
                if required not in csp:raise ReleaseHold('missing restrictive CSP')
            if path=='sw.js' and not ('no-cache' in headers.get('cache-control','')):
                raise ReleaseHold('service worker must not be cache-stranded')
            seen[path]=digest
        except ReleaseHold as e:errors.append({'file':path,'hold':str(e)})
    return {'state':'READY_FOR_PHYSICAL_DEVICE_ACCEPTANCE' if not errors else 'HOLD_HOSTED_RELEASE',
            'verified_assets':len(seen),'total_assets':len(manifest['assets']),'failures':errors,
            'independent_ios_acceptance':False,'source':'BYTE_HASHED_PUBLIC_STATIC_RELEASE_ONLY',
            'warning':'No private data, hardware, water savings or offline real-device behavior was verified'}

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--url',required=True);a.add_argument('--expected-host',required=True);args=a.parse_args()
    result=verify(args.url,args.expected_host)
    print(json.dumps(result,indent=2));sys.exit(0 if result['state'].startswith('READY') else 2)
if __name__=='__main__':main()
