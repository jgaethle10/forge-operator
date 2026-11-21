import sys
from pathlib import Path
import tempfile
import unittest

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kss_pdf_fidelity_inspect import inspect_pdf

ROLES = ('C101','C102','E101','D501')


def make_pdf(path, *, roles=ROLES, size=(2592,1728), disclaim=True, source=True):
    doc=fitz.open()
    for idx,role in enumerate(roles):
        p=doc.new_page(width=size[0],height=size[1])
        p.insert_text((75,75),f'{role} | INDEPENDENT EV CONCEPT SHEET',fontsize=24)
        p.insert_text((75,125),'PRELIMINARY | NOT FOR CONSTRUCTION' if disclaim else 'DRAFT',fontsize=16)
        p.insert_text((75,160),'SOURCE: synthetic geometry | FIELD VERIFY' if source else 'visual only',fontsize=12)
        for j in range(12):
            p.draw_rect(fitz.Rect(80+j*65,250,122+j*65,290),color=(0,0,0))
    doc.save(path)
    doc.close()


class KssStructuralGate(unittest.TestCase):
    def run_pdf(self, **kwargs):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'fixture.pdf'
            make_pdf(path,**kwargs)
            return inspect_pdf(path,expected_sites=1)

    def test_full_four_sheet_synthetic_has_structural_pass_only(self):
        result=self.run_pdf()
        self.assertEqual(result['structural_gate'],'PASS')
        self.assertFalse(result['external_release_allowed'])
        self.assertEqual(result['pages'],4)

    def test_one_sheet_wireframe_is_rejected(self):
        result=self.run_pdf(roles=('C101',))
        self.assertEqual(result['structural_gate'],'HOLD')
        self.assertIn('missing_required_sheet_role',result['alerts'])

    def test_incorrect_drawing_format_is_rejected(self):
        result=self.run_pdf(size=(792,612))
        self.assertIn('nonstandard_36x24_landscape_sheet',result['alerts'])

    def test_out_of_order_sheet_roles_are_rejected(self):
        result=self.run_pdf(roles=('C102','C101','E101','D501'))
        self.assertIn('sheet_roles_out_of_sequence',result['alerts'])

    def test_safety_labels_must_be_visible(self):
        result=self.run_pdf(disclaim=False)
        self.assertIn('preliminary_construction_disclaimer_missing',result['alerts'])

    def test_source_and_verify_notes_are_required(self):
        result=self.run_pdf(source=False)
        self.assertIn('source_or_field_verify_context_missing',result['alerts'])

if __name__=='__main__':
    unittest.main()
