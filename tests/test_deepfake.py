"""Unit tests for Acoustic Deepfake Detection Layer."""
import io
import unittest
import wave
import numpy as np

from ml.deepfake import (
    AudioDeepfakeDetector,
    check_audio_quality,
    decode_audio_bytes,
    extract_acoustic_indicators,
    extract_lfcc,
)


class TestAudioDeepfakeDetector(unittest.TestCase):
    def setUp(self):
        self.detector = AudioDeepfakeDetector()
        self.sample_rate = 16000

    def test_detector_availability(self):
        self.assertTrue(self.detector.is_available)
        self.assertEqual(self.detector.metadata.get("model_id"), "aasist-acoustic-guard-v1")

    def test_decode_wav_bytes(self):
        # Generate 1 sec 16kHz sine WAV in memory
        t = np.linspace(0, 1.0, 16000, dtype=np.float32)
        sine = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(sine.tobytes())
        wav_bytes = buf.getvalue()

        decoded, sr = decode_audio_bytes(wav_bytes)
        self.assertEqual(sr, 16000)
        self.assertEqual(len(decoded), 16000)
        self.assertAlmostEqual(float(np.max(np.abs(decoded))), 0.5, places=1)

    def test_decode_raw_pcm_bytes(self):
        pcm_bytes = (np.ones(8000, dtype=np.int16) * 16384).tobytes()
        decoded, sr = decode_audio_bytes(pcm_bytes, sample_rate=16000)
        self.assertEqual(sr, 16000)
        self.assertEqual(len(decoded), 8000)
        self.assertAlmostEqual(float(decoded[0]), 0.5, places=2)

    def test_quality_check_silence(self):
        silence = np.zeros(16000, dtype=np.float32)
        q = check_audio_quality(silence, 16000)
        self.assertEqual(q.status, "insufficient")
        self.assertIn("Audio is virtually silent or muted.", q.limitations)

    def test_quality_check_too_short(self):
        short_audio = np.random.randn(4000).astype(np.float32) * 0.1
        q = check_audio_quality(short_audio, 16000)
        self.assertEqual(q.status, "insufficient")
        self.assertTrue(any("shorter than minimum" in lim for lim in q.limitations))

    def test_quality_check_adequate(self):
        t = np.linspace(0, 2.0, 32000, dtype=np.float32)
        signal = 0.4 * np.sin(2 * np.pi * 300 * t) + 0.05 * np.random.randn(32000).astype(np.float32)
        q = check_audio_quality(signal, 16000)
        self.assertIn(q.status, ["adequate", "degraded"])
        self.assertGreater(q.duration_s, 1.9)

    def test_lfcc_feature_extraction(self):
        t = np.linspace(0, 1.0, 16000, dtype=np.float32)
        signal = 0.3 * np.sin(2 * np.pi * 250 * t)
        lfcc = extract_lfcc(signal, sample_rate=16000, num_cepstral=20)
        self.assertGreater(lfcc.shape[0], 50)
        self.assertEqual(lfcc.shape[1], 20)

    def test_acoustic_indicators(self):
        t = np.linspace(0, 1.5, 24000, dtype=np.float32)
        signal = 0.4 * np.sin(2 * np.pi * 350 * t)
        feat, ind = extract_acoustic_indicators(signal, 16000)
        self.assertEqual(len(feat), 84)
        self.assertIn("pitch_contour_stiffness", ind)
        self.assertIn("mean_spectral_flatness", ind)

    def test_end_to_end_analysis_schema(self):
        t = np.linspace(0, 2.0, 32000, dtype=np.float32)
        signal = 0.3 * np.sin(2 * np.pi * 300 * t) + 0.02 * np.random.randn(32000).astype(np.float32)
        res = self.detector.analyze(signal)

        self.assertEqual(res["schema_version"], 1)
        self.assertEqual(res["analysis_status"], "completed")
        self.assertEqual(res["media_type"], "audio")
        self.assertIn(
            res["authenticity_assessment"],
            ["synthetic_suspected", "no_strong_synthetic_indication", "inconclusive"],
        )
        self.assertIsInstance(res["raw_model_score"], float)
        self.assertEqual(res["calibration_status"], "calibrated")
        self.assertIsInstance(res["processing_time_ms"], (int, float))
        self.assertIsInstance(res["limitations"], list)
        self.assertIsInstance(res["acoustic_indicators"], dict)

    def test_missing_weights_graceful_degradation(self):
        fallback_detector = AudioDeepfakeDetector(weights_dir="nonexistent/directory")
        self.assertFalse(fallback_detector.is_available)

        signal = 0.3 * np.random.randn(16000).astype(np.float32)
        res = fallback_detector.analyze(signal)
        self.assertEqual(res["analysis_status"], "model_unavailable")
        self.assertEqual(res["authenticity_assessment"], "inconclusive")
        self.assertIsNone(res["raw_model_score"])


if __name__ == "__main__":
    unittest.main()
