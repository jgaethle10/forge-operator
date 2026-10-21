import copy,importlib.util,json,pathlib,unittest
here=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('context_performance',here/'systemia-v15-context-performance.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
original=json.loads((here/'systemia-v15-emotion-context-plan.json').read_text())

class ContextualVoiceTests(unittest.TestCase):
    def test_real_causal_emotional_arc(self):
        p=mod.validate(copy.deepcopy(original))
        self.assertEqual(len(p['turns']),7)
        self.assertEqual(p['turns'][-1]['after'],'approval_required')
        self.assertEqual(p['turns'][3]['before'],'expectation_violation')
        self.assertLess(p['turns'][0]['intensity'],p['turns'][3]['intensity'])
        self.assertEqual(p['turns'][-1]['speaker'],'agent')
        self.assertTrue(all(mod.WORD(t['text'])==mod.WORD(t['directedText']) for t in p['turns']))
    def test_changing_conversation_state_fails(self):
        d=copy.deepcopy(original);d['turns'][3]['before']='routine'
        with self.assertRaisesRegex(ValueError,'context_state_transition_missing'):mod.validate(d)
    def test_changing_initiating_event_fails(self):
        d=copy.deepcopy(original);d['turns'][2]['event']='owner_accepts_and_corrects'
        with self.assertRaisesRegex(ValueError,'event_sequence_missing'):mod.validate(d)
    def test_agent_must_react_only_after_actual_owner_action(self):
        d=copy.deepcopy(original);d['turns'][-1]['sceneStart']=19.74
        with self.assertRaisesRegex(ValueError,'premature_agent_acknowledgment'):mod.validate(d)
    def test_prohibited_semantic_word_edits(self):
        d=copy.deepcopy(original);d['turns'][3]['directedText']='Everything is wonderful'
        with self.assertRaisesRegex(ValueError,'performance_must_not_rewrite_words'):mod.validate(d)
    def test_excessive_speed_adjustment_rejected(self):
        d=copy.deepcopy(original);d['turns'][3]['directedSpeed']=.71
        with self.assertRaisesRegex(ValueError,'tempo_bound_exceeded'):mod.validate(d)
    def test_cannot_swap_voice_roles(self):
        d=copy.deepcopy(original);d['turns'][3]['voice']='af_heart'
        with self.assertRaisesRegex(ValueError,'voice_role_mismatch'):mod.validate(d)
    def test_no_claimed_rights_without_evidence(self):
        d=copy.deepcopy(original);d['boundaries']['publicReleaseAuthorized']=True
        with self.assertRaisesRegex(ValueError,'commercial_rights_gate'):mod.validate(d)

if __name__=='__main__':unittest.main()
