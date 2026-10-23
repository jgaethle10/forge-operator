import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
import warnings
import zipfile
spec=importlib.util.spec_from_file_location('installer',pathlib.Path(__file__).with_name('install-laser-foundry.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class InstallTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.addCleanup(self.tmp.cleanup)
  self.root=pathlib.Path(self.tmp.name)
 def fixture(self,extra=None):
  p=self.root/'package.zip'
  with warnings.catch_warnings():
   warnings.simplefilter('ignore',UserWarning)
   with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
    for n in m.MANIFEST:z.writestr(n,b'safe text\n')
    if extra:extra(z)
  return p,hashlib.sha256(p.read_bytes()).hexdigest()
 def test_verifies_sha_and_extracts_without_running_code(self):
  p,digest=self.fixture()
  dest=self.root/'apps'/'laser'
  result=m.install(p,dest,digest)
  self.assertEqual(result['file_count'],12)
  self.assertTrue((dest/'LaserFoundryStudio/studio.py').is_file())
  self.assertFalse(result['service_started'])
  self.assertFalse(result['python_dependencies_installed'])
  with self.assertRaisesRegex(ValueError,'destination_already_exists'):
   m.install(p,dest,digest)
 def test_rejects_untrusted_digest(self):
  p,_=self.fixture()
  with self.assertRaisesRegex(ValueError,'archive_sha256_pin_mismatch'):
   m.install(p,self.root/'app')
 def test_rejects_traversal_and_extra_paths(self):
  p,digest=self.fixture(lambda z:z.writestr('../escape','malicious'))
  with self.assertRaisesRegex(ValueError,'archive_manifest_not_exact_allowlist'):
   m.install(p,self.root/'app',digest)
  self.assertFalse((self.root/'escape').exists())
 def test_rejects_duplicate_entries(self):
  p,digest=self.fixture(lambda z:z.writestr('LaserFoundryStudio/studio.py','replacement'))
  with self.assertRaisesRegex(ValueError,'archive_manifest_not_exact_allowlist'):
   m.install(p,self.root/'app',digest)
 def test_rejects_existing_symlink_target(self):
  p,digest=self.fixture()
  out=self.root/'other'
  out.mkdir()
  target=self.root/'app'
  target.symlink_to(out,target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'destination_already_exists'):
   m.install(p,target,digest)
if __name__=='__main__':unittest.main()
