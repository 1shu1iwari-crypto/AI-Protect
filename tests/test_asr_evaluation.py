import unittest
from ml.asr.evaluate_asr import evaluate


class TestAsrEvaluation(unittest.TestCase):
    def test_hindi_negation_omission_increases_error_and_loses_critical_term(self):
        result = evaluate([dict(id='fixture-1', model='test', language='hi', reference='ओटीपी मत बताओ', hypothesis='ओटीपी बताओ', critical_terms=['मत'])])
        row = result['groups'][0]
        self.assertEqual(row['word_errors'], 1)
        self.assertAlmostEqual(row['wer'], 1/3)
        self.assertEqual(row['critical_term_preservation'], 0)
        self.assertNotIn('ओटीपी', str(result))

    def test_empty_model_output_counts_as_errors_and_models_compare_separately(self):
        rows = [dict(id='same',model=model,language='en',reference='Never share OTP',hypothesis=value) for model,value in [('a',''),('b','Never share OTP')]]
        result = evaluate(rows)
        self.assertEqual(result['groups'][0]['wer'],1)
        self.assertEqual(result['groups'][1]['wer'],0)
        with self.assertRaises(ValueError): evaluate([rows[0],rows[0]])
        with self.assertRaises(ValueError): evaluate([])
