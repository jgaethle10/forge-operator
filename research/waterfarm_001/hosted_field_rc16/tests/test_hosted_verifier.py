import hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'deployment'))
from verify_hosted import verify,validate_origin,ReleaseHold
class HostVerifierTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parents[1]
        paths=['index.html','app/app.js','sw.js','manifest.webmanifest','icon-192.png']
        self.m={'assets':{p:{'sha256':hashlib.sha256((self.root/p).read_bytes()).hexdigest(),'bytes':(self.root/p).stat().st_size} for p in paths}}
        self.url='https://owned.evercraft.example/aqua/'
    def source(self,url):
        p=url.split('/aqua/')[1]
        mime='text/html' if p.endswith('html') else 'application/javascript' if p.endswith(('.js','.mjs')) else 'application/manifest+json' if p.endswith('webmanifest') else 'image/png'
        headers={'content-type':mime,'x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'no-cache','content-security-policy':"default-src 'none'; connect-src 'none'; worker-src 'self'"}
        return (self.root/p).read_bytes(),headers
    def test_release_matches_exact_static_files(self):
        out=verify(self.url,'owned.evercraft.example',self.source,self.m)
        self.assertEqual(out['state'],'READY_FOR_PHYSICAL_DEVICE_ACCEPTANCE')
        self.assertFalse(out['independent_ios_acceptance'])
    def test_changed_remote_bytes_hold(self):
        def tampered(url):
            raw,h=self.source(url)
            if url.endswith('sw.js'):return raw+b'// modified',h
            return raw,h
        out=verify(self.url,'owned.evercraft.example',tampered,self.m)
        self.assertEqual(out['state'],'HOLD_HOSTED_RELEASE')
        self.assertEqual(out['failures'][0]['file'],'sw.js')
    def test_missing_security_header_hold(self):
        def no_csp(url):
            raw,h=self.source(url);h.pop('content-security-policy');return raw,h
        out=verify(self.url,'owned.evercraft.example',no_csp,self.m)
        self.assertEqual(out['state'],'HOLD_HOSTED_RELEASE')
    def test_unapproved_http_and_host_hold(self):
        for url in ['http://owned.evercraft.example/aqua/','https://other.example/aqua/','https://owned.evercraft.example/aqua/?token=x','https://user:pass@owned.evercraft.example/aqua/','https://owned.evercraft.example/']:
            with self.subTest(url=url),self.assertRaises(ReleaseHold):validate_origin(url,'owned.evercraft.example')
if __name__=='__main__':unittest.main()
