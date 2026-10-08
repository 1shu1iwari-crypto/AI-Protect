"""Procedural-waveform diagnostic only, not a human/voice-clone benchmark.
Generated sine/harmonic waveforms cannot establish performance on genuine speech,
TTS, cloned voices or actual telephony codecs. Use licensed real-audio evaluation.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
from scipy.signal import butter, sosfilt

from ml.deepfake import AudioDeepfakeDetector, default_deepfake_detector

RESULTS_PATH = Path(__file__).resolve().parent / "deepfake_benchmark_results.json"


def simulate_telephony_audio(audio: np.ndarray, sample_rate: int = 16000) -> np.ndarray:
    """Applies 300Hz - 3400Hz bandpass filter simulating standard mobile/PSTN voice codecs."""
    sos = butter(4, [300.0, 3400.0], btype="bandpass", fs=sample_rate, output="sos")
    filtered = sosfilt(sos, audio).astype(np.float32)
    # Add slight background line noise
    noise = np.random.randn(len(audio)).astype(np.float32) * 0.005
    return filtered + noise


def run_deepfake_evaluation():
    print("=" * 70)
    print("RUNNING PROCEDURAL WAVEFORM DIAGNOSTIC — NOT REAL-SPEECH VALIDATION")
    print("=" * 70)

    detector = AudioDeepfakeDetector()
    if not detector.is_available:
        print("[ERROR] Deepfake detector is not available!")
        return

    rng = np.random.RandomState(1337)
    n_bona = 50
    n_synth = 50

    latencies = []
    bona_scores = []
    synth_scores = []
    telephony_scores = []

    print("\n[1/4] Evaluating natural-like procedural (Human Speech) False Alarm Rate...")
    # Generate varied authentic-like voice samples (dynamic micro-jitter, natural harmonic decay)
    for i in range(n_bona):
        duration = 2.0
        n_points = int(duration * 16000)
        t = np.linspace(0, duration, n_points, dtype=np.float32)
        f0 = rng.uniform(110.0, 240.0)
        prosody = 25.0 * np.sin(2 * np.pi * rng.uniform(1.0, 2.5) * t)
        jitter = np.cumsum(rng.randn(n_points) * 0.35)
        inst_freq = np.clip(f0 + prosody + jitter, 70.0, 420.0)
        phase = 2 * np.pi * np.cumsum(inst_freq / 16000.0)

        glottal = (
            np.sin(phase)
            + 0.5 * np.sin(2 * phase)
            + 0.25 * np.sin(3 * phase)
            + 0.12 * np.sin(4 * phase)
        )
        f_res = rng.uniform(700.0, 2000.0)
        r = 0.92
        w = 2 * np.pi * f_res / 16000.0
        b = [1.0, -0.8]
        a = [1.0, -2 * r * np.cos(w), r * r]
        from scipy.signal import lfilter
        signal = lfilter(b, a, glottal)
        signal += 0.02 * rng.randn(n_points).astype(np.float32)
        signal = signal / (np.max(np.abs(signal)) + 1e-6)

        start = time.perf_counter()
        res = detector.analyze(signal)
        latencies.append((time.perf_counter() - start) * 1000)
        score = res["raw_model_score"]
        if score is not None:
            bona_scores.append(score)

    bona_fp = sum(1 for s in bona_scores if s >= 0.65)
    bona_fpr = (bona_fp / max(1, len(bona_scores))) * 100.0
    print(f"      Evaluated samples: {len(bona_scores)}")
    print(f"      False Alarm Rate: {bona_fpr:.2f}% (Target: < 5%)")

    print("\n[2/4] Evaluating rigid procedural waveforms (not TTS / voice clones)...")
    # Generate synthetic-like voice samples (high stiffness, reduced micro-jitter, vocoder harmonics)
    for i in range(n_synth):
        t = np.linspace(0, 2.5, int(2.5 * 16000), dtype=np.float32)
        f0 = rng.uniform(130.0, 220.0)
        # Rigid fundamental frequency with buzzy harmonic pulse train
        signal = np.zeros_like(t)
        for h in range(1, 8):
            signal += (0.25 / h) * np.sin(2 * np.pi * h * f0 * t)
        # Step-wise flat envelopes characteristic of concatenated synthesis
        step_env = np.repeat(rng.uniform(0.3, 0.8, size=10), len(t) // 10)
        signal = signal[:len(step_env)] * step_env + 0.002 * rng.randn(len(step_env)).astype(np.float32)

        start = time.perf_counter()
        res = detector.analyze(signal)
        latencies.append((time.perf_counter() - start) * 1000)
        score = res["raw_model_score"]
        if score is not None:
            synth_scores.append(score)

    synth_tp = sum(1 for s in synth_scores if s >= 0.65)
    synth_recall = (synth_tp / max(1, len(synth_scores))) * 100.0
    print(f"      Evaluated synthetic samples: {len(synth_scores)}")
    print(f"      Synthetic Detection Recall: {synth_recall:.2f}% (Target: > 90%)")

    print("\n[3/4] Evaluating Telephony Codec Robustness (G.711 300-3400Hz Simulation)...")
    for i in range(25):
        t = np.linspace(0, 2.0, int(2.0 * 16000), dtype=np.float32)
        f0 = 180.0
        signal = np.zeros_like(t)
        for h in range(1, 6):
            signal += (0.2 / h) * np.sin(2 * np.pi * h * f0 * t)
        telephony_audio = simulate_telephony_audio(signal)
        res = detector.analyze(telephony_audio)
        if res["raw_model_score"] is not None:
            telephony_scores.append(res["raw_model_score"])

    telephony_recall = (sum(1 for s in telephony_scores if s >= 0.55) / max(1, len(telephony_scores))) * 100.0
    print(f"      Telephony Detection Retention: {telephony_recall:.1f}%")

    p50_ms = float(np.percentile(latencies, 50))
    p95_ms = float(np.percentile(latencies, 95))
    print(f"\n[4/4] CPU Latency Profile:")
    print(f"      p50: {p50_ms:.2f} ms | p95: {p95_ms:.2f} ms")

    summary = {
        "model_id": detector.metadata.get("model_id"),
        "model_version": detector.metadata.get("model_version"),
        "architecture": detector.metadata.get("architecture"),
        "evaluation_domain": "procedural_waveforms",
        "validation_status": "experimental",
        "real_speech_accuracy": None,
        "limitations": ["No real human speech or real voice clones were used.", "Bandpass/noise simulation is not a G.711 codec benchmark."],
        "bona_fide_samples": len(bona_scores),
        "false_alarm_rate_percent": round(bona_fpr, 2),
        "synthetic_samples": len(synth_scores),
        "synthetic_recall_percent": round(synth_recall, 2),
        "telephony_retention_percent": round(telephony_recall, 2),
        "latency_p50_ms": round(p50_ms, 2),
        "latency_p95_ms": round(p95_ms, 2),
    }

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n[OK] Deepfake benchmark results saved to: {RESULTS_PATH}")


if __name__ == "__main__":
    run_deepfake_evaluation()
