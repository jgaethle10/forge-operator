#!/usr/bin/env python3
"""Offline, no-model tests for real Kokoro word timing evidence and safe claims."""
import importlib.util
import pathlib
import subprocess
import sys
import types
import unittest

PATH=pathlib.Path(__file__).with_name("voice-bella-native-duration-study.py")
spec=importlib.util.spec_from_file_location("bella_native_duration",PATH)
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class Durations:
    def __init__(self,items): self.items=items
    def tolist(self): return self.items


def result_fixture(wrong=False, missing=False, secs=.18):
    tokens = []
    for i,w in enumerate(("You","know","that","moment")):
        tokens.append(types.SimpleNamespace(
            text=w,phonemes=("ðˈæt" if i==2 else "abc"),
            start_ts=None if (missing and i==1) else i*.45,
            end_ts=None if (missing and i==1) else i*.45+secs))
    if wrong: tokens[2].text="the"
    return types.SimpleNamespace(
        phonemes="abc abc ðˈæt abc",
        pred_dur=Durations([2,4,5,4,3,1]),
        audio=[0]*int(24000*3.0),tokens=tokens)


class BellaDurationTests(unittest.TestCase):
    def test_word_lock_is_exact(self):
        lab.preflight()
        self.assertEqual(lab.words(lab.BASE),lab.words(lab.CONNECTED))

    def test_native_frame_outputs_preserve_model_provenance(self):
        report=lab.inspect_result(result_fixture(),"You know that moment")
        self.assertEqual(report["totalPredictedModelTimeSec"],.475)
        self.assertTrue(report["nativeTokenTimesUsable"])
        self.assertTrue(report["tokenTimesAreModelDerivedNotIndependentAlignments"])
        self.assertFalse(report["predictedWordRecords"][2]["isIndependentAudioAlignment"])
        self.assertEqual(report["predictedWordRecords"][2]["lexicalStressMarks"],1)

    def test_missing_word_time_never_invented(self):
        report=lab.inspect_result(result_fixture(missing=True),"You know that moment")
        self.assertFalse(report["nativeTokenTimesUsable"])
        self.assertIsNone(report["predictedWordRecords"][1]["predictedTotalWordSec"])
        self.assertFalse(lab.compare(report,report)["comparisonAvailable"])

    def test_wrong_token_word_does_not_claim_coverage(self):
        report=lab.inspect_result(result_fixture(wrong=True),"You know that moment")
        self.assertFalse(report["wordCoverageMatchesScript"])
        self.assertFalse(report["nativeTokenTimesUsable"])

    def test_missing_prediction_rejected(self):
        r=result_fixture();r.pred_dur=None
        with self.assertRaisesRegex(ValueError,"DURATIONS_NOT_EXPOSED"):
            lab.inspect_result(r,"You know that moment")

    def test_comparison_is_only_candidate_not_quality_verdict(self):
        first=lab.inspect_result(result_fixture(secs=.18),"You know that moment")
        second=lab.inspect_result(result_fixture(secs=.31),"You know that moment")
        diff=lab.compare(first,second)
        self.assertTrue(diff["comparisonAvailable"])
        self.assertEqual(len(diff["candidateDifferences"]),4)
        self.assertFalse(any(x["humanDefectConfirmed"] for x in diff["candidateDifferences"]))

    def test_cli_preflight_no_neural_weights(self):
        r=subprocess.run([sys.executable,str(PATH),"--verify-only"],
                         capture_output=True,text=True,check=True,timeout=12)
        self.assertIn("PASS",r.stdout)


if __name__=="__main__":
    unittest.main()
