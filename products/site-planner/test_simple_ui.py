"""Simple-first Kennedy Studio UX: essentials visible, expert controls optional."""
import re
import subprocess
import unittest
from pathlib import Path

HTML = Path(__file__).with_name("plan-studio.html")


class SimpleStudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = HTML.read_text(encoding="utf-8")

    def test_exactly_three_primary_actions(self):
        page=self.page
        self.assertEqual(page.count('class="quick-step"'),3)
        labels=['Add your site photo','Tap where chargers go','Get your plan']
        self.assertEqual([page.index(s) for s in labels],sorted(page.index(s) for s in labels))
        primary=page.split('<details id="advancedTools"',1)[0]
        for fragment in ('id="siteImage"','id="address"','data-tool="charger"','id="undo"','id="print"','id="chargerCount"','id="scaleState"'):
            self.assertIn(fragment,primary)
        self.assertIn('View / Save PDF',primary)
        self.assertIn('Not for construction.',primary)

    def test_advanced_options_stay_available_but_collapsed(self):
        page=self.page
        self.assertIn('<details id="advancedTools" class="advanced-panel">',page)
        section=page.split('<details id="advancedTools" class="advanced-panel">',1)[1].split('</details>',1)[0]
        for fragment in ('id="contextImage"','id="siteName"','id="rev"','id="knownFeet"',
                         'data-tool="route"','data-tool="pad"','data-tool="access"',
                         'data-tool="erase"','data-tool="calibrate"',
                         'id="draftSave"','id="draftLoad"','id="export"','id="evidence"'):
            self.assertIn(fragment,section)
        self.assertNotIn(' open>',page.split('<details id="advancedTools"',1)[1].split('>',1)[0] + '>')

    def test_simple_screen_does_not_claim_automatic_engineering(self):
        page=self.page
        self.assertIn('No photo yet. The preview is fictional.',page)
        self.assertIn('source image',page)
        self.assertIn('not a survey',page.lower())
        self.assertNotIn('buy.stripe.com',page)
        self.assertIn("state.marks=[];state.history=[];state.selectedMarkIndex=null",page)
        self.assertIn('state.calibration=null',page)
        self.assertIn('if($(\'siteName\').value===\'DEMONSTRATION RETAIL SITE\')',page)

    def test_inline_javascript_compiles_and_keeps_core_actions(self):
        page=self.page
        script=page.split('<script>',1)[1].split('</script>',1)[0]
        result=subprocess.run(['node','-e','new Function(require("fs").readFileSync("plan-studio.html","utf8").split("<script>")[1].split("</script>")[0])'],
                              cwd=HTML.parent,capture_output=True,text=True,timeout=8)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("onCanvasTap",script)
        self.assertIn("readImage",script)
        self.assertIn("('activeTool').textContent",script)


if __name__ == "__main__":
    unittest.main()
