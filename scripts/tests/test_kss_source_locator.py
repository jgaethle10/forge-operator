import sys
from pathlib import Path
import tempfile
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from kss_source_locator import inspect_roots


class KssSourceLocatorTests(unittest.TestCase):
    def test_finds_exact_source_and_hashes_without_modifying(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            p=root/'kss_siteplan_profiles.py'
            p.write_text('source fixture')
            result=inspect_roots([root])
            self.assertEqual(len(result['hits']),1)
            self.assertEqual(result['hits'][0]['kind'],'file')
            self.assertEqual(p.read_text(),'source fixture')
            self.assertFalse(result['source_bytes_uploaded'])
            self.assertEqual(result['network_requests'],0)

    def test_reads_zip_central_directory_without_extraction(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            zip_path=root/'local-archive.zip'
            with zipfile.ZipFile(zip_path,'w') as z:
                z.writestr('nested/kss_review_pdf_optimize.py','fixture')
            result=inspect_roots([root],include_zip=True)
            self.assertEqual(len(result['hits']),1)
            self.assertEqual(result['hits'][0]['kind'],'archive_entry')
            self.assertFalse(result['hits'][0]['content_extracted'])
            self.assertFalse((root/'nested').exists())

    def test_does_not_follow_symlinks_or_match_unrelated_names(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            (root/'not-kss-siteplan-profiles.py').write_text('noise')
            (root/'kss_siteplan_profiles.py').symlink_to(root/'not-kss-siteplan-profiles.py')
            result=inspect_roots([root])
            self.assertEqual(result['hits'],[])

    def test_bounded_scanning(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for i in range(4): (root/f'{i}.txt').write_text('noise')
            result=inspect_roots([root],max_files=1)
            self.assertIn('max_files_reached',result['warnings'])

if __name__=='__main__': unittest.main()
