"""Training and ONNX export for Acoustic Anti-Spoofing Deepfake Classifier.

Generates procedural natural-like and rigid waveforms (not real human speech or voice clones;
rigid pitch, unnatural harmonic distributions), extracts 84-d acoustic features via
the production feature extractor, trains a calibrated classifier, and exports
to an optimized ONNX model graph for local inference.
"""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np
from scipy.signal import lfilter
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import sys
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.deepfake.features import extract_acoustic_indicators

WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"


def generate_speech_waveforms(n_samples: int = 400, random_state: int = 42):
    """Generates two procedural waveform classes, neither of which is genuine speech."""
    rng = np.random.RandomState(random_state)
    sr = 16000
    X = []
    y = []

    print(f"      Synthesizing and extracting features from {n_samples} benchmark waveforms...")

    for i in range(n_samples):
        duration = rng.uniform(1.2, 2.5)
        n_points = int(sr * duration)
        t = np.linspace(0, duration, n_points, dtype=np.float32)

        is_synthetic = (i % 2 == 1)

        if not is_synthetic:
            # Bona-fide human speech simulation:
            # 1. Pitch with micro-tremor, natural drift, and prosodic contour
            f0 = rng.uniform(100.0, 260.0)
            prosody = 20.0 * np.sin(2 * np.pi * rng.uniform(1.0, 3.0) * t)
            jitter = np.cumsum(rng.randn(n_points) * 0.3)
            inst_freq = np.clip(f0 + prosody + jitter, 60.0, 450.0)
            phase = 2 * np.pi * np.cumsum(inst_freq / sr)

            # 2. Glottal pulses with natural harmonic decay
            glottal = (
                np.sin(phase)
                + 0.5 * np.sin(2 * phase)
                + 0.25 * np.sin(3 * phase)
                + 0.12 * np.sin(4 * phase)
            )

            # 3. Dynamic vocal tract formant filtering
            f_res = rng.uniform(600.0, 2200.0)
            r = 0.92
            w = 2 * np.pi * f_res / sr
            b = [1.0, -0.8]
            a = [1.0, -2 * r * np.cos(w), r * r]
            waveform = lfilter(b, a, glottal)

            # 4. Natural background acoustic noise & breathiness
            waveform += 0.02 * rng.randn(n_points).astype(np.float32)
            waveform = waveform / (np.max(np.abs(waveform)) + 1e-6)
            label = 0
        else:
            # Synthetic / Spoofed speech simulation:
            # 1. Rigid fundamental frequency without natural glottal micro-jitter
            f0 = rng.uniform(120.0, 240.0)
            phase = 2 * np.pi * f0 * t

            # 2. Unnatural vocoder buzz with strict integer harmonics
            glottal = np.zeros(n_points, dtype=np.float32)
            num_harmonics = rng.randint(6, 14)
            for h in range(1, num_harmonics):
                glottal += (0.3 / h) * np.sin(h * phase)

            # 3. Flat envelope or abrupt concatenative blocks
            block_size = max(100, n_points // 8)
            envelope = np.repeat(rng.uniform(0.4, 0.9, size=n_points // block_size + 1), block_size)[:n_points]
            waveform = glottal * envelope

            # 4. Quantization / vocoder spectral smoothing
            waveform += 0.003 * rng.randn(n_points).astype(np.float32)
            waveform = waveform / (np.max(np.abs(waveform)) + 1e-6)
            label = 1

        feats, _ = extract_acoustic_indicators(waveform, sr)
        X.append(feats)
        y.append(label)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


def train_and_export_model():
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = WEIGHTS_DIR / "acoustic_guard_v1.onnx"
    metadata_path = WEIGHTS_DIR / "metadata.json"

    print("[1/3] Generating procedural demonstration waveforms (not ASVspoof data) and extracting features...")
    X, y = generate_speech_waveforms(n_samples=360, random_state=42)

    split_idx = int(0.8 * len(y))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    print("[2/3] Training experimental waveform classifier...")
    scaler = StandardScaler()
    mlp = MLPClassifier(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        alpha=0.01,
        max_iter=350,
        random_state=42,
        early_stopping=True,
    )
    pipeline = Pipeline([("scaler", scaler), ("mlp", mlp)])
    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    probs = pipeline.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, probs)
    print(f"      Validation ROC-AUC: {auc:.4f}")
    print(classification_report(y_test, preds, target_names=["bona-fide", "synthetic"]))

    print(f"[3/3] Exporting to ONNX graph: {onnx_path}...")
    initial_type = [("float_input", FloatTensorType([None, 84]))]
    onnx_model = convert_sklearn(
        pipeline,
        initial_types=initial_type,
        target_opset=17,
        options={id(mlp): {"zipmap": False}},
    )

    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    metadata = {
        "model_id": "procedural-acoustic-demo-v1",
        "model_version": "1.0.0",
        "architecture": "84-feature LFCC/spectral MLP",
        "training_domain": "procedural_waveforms",
        "validation_status": "experimental",
        "calibration_status": "uncalibrated",
        "real_speech_evaluation": None,
        "input_dimensions": 84,
        "input_name": "float_input",
        "output_probabilities_name": "probabilities",
        "output_label_name": "label",
        "sample_rate_hz": 16000,
        "experimental_metrics": {"procedural_auc_roc": round(float(auc), 4)},
        "license": "Apache-2.0",
        "thresholds": {
            "synthetic_suspected": 0.65,
            "no_strong_synthetic_indication": 0.40,
            "inconclusive_low": 0.40,
            "inconclusive_high": 0.65,
        },
    }
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[OK] Experimental ONNX waveform classifier saved ({onnx_path.stat().st_size} bytes).")


if __name__ == "__main__":
    train_and_export_model()
