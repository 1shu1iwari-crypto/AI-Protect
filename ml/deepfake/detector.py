"""Audio Deepfake Detector Engine.

Accepts audio recordings/streams, performs audio quality screening,
extracts linear frequency cepstral coefficients and spectral metrics,
and runs local ONNX neural network inference.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import numpy as np

try:
    import onnxruntime as ort

    ONNX_AVAILABLE = True
except ImportError:
    ort = None
    ONNX_AVAILABLE = False

from .features import (
    AudioQualityResult,
    check_audio_quality,
    decode_audio_bytes,
    extract_acoustic_indicators,
)

DEFAULT_WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"


class AudioDeepfakeDetector:
    """Production-grade modular acoustic deepfake detector."""

    def __init__(self, weights_dir: Optional[Union[str, Path]] = None):
        self.weights_dir = Path(weights_dir or DEFAULT_WEIGHTS_DIR)
        self.model_path = self.weights_dir / "acoustic_guard_v1.onnx"
        self.metadata_path = self.weights_dir / "metadata.json"

        self.metadata = self._load_metadata()
        self.session: Optional[ort.InferenceSession] = None
        self._init_error: Optional[str] = None
        self._load_session()

    def _load_metadata(self) -> Dict[str, Any]:
        if self.metadata_path.is_file():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "model_id": "aasist-acoustic-guard-v1",
            "model_version": "1.0.0",
            "thresholds": {
                "synthetic_suspected": 0.65,
                "no_strong_synthetic_indication": 0.40,
            },
        }

    def _load_session(self) -> None:
        if not ONNX_AVAILABLE:
            self._init_error = "ONNX Runtime is not installed on this system."
            return

        if not self.model_path.is_file():
            self._init_error = f"Model weights file not found: {self.model_path}"
            return

        try:
            # CPU-optimized execution options
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = min(4, os.cpu_count() or 1)
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self.session = ort.InferenceSession(
                str(self.model_path), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            self._init_error = None
        except Exception as e:
            self.session = None
            self._init_error = f"Failed to initialize ONNX inference session: {e}"

    @property
    def is_available(self) -> bool:
        return self.session is not None

    def analyze(
        self,
        audio_input: Union[bytes, str, Path, np.ndarray],
        sample_rate: int = 16000,
    ) -> Dict[str, Any]:
        """Performs full acoustic anti-spoofing analysis on user-consented audio.

        Zero audio retention: raw bytes or buffers are discarded after feature extraction.
        """
        start_time = time.perf_counter()
        schema_version = 1
        model_id = self.metadata.get("model_id", "aasist-acoustic-guard-v1")
        model_version = self.metadata.get("model_version", "1.0.0")

        # 1. Decode audio
        waveform: np.ndarray
        actual_sr = sample_rate

        try:
            if isinstance(audio_input, (str, Path)):
                path = Path(audio_input)
                if not path.is_file():
                    return self._error_result(
                        "decode_failure",
                        ["Specified audio file does not exist."],
                        start_time,
                    )
                with open(path, "rb") as f:
                    raw_bytes = f.read()
                waveform, actual_sr = decode_audio_bytes(raw_bytes, sample_rate)
            elif isinstance(audio_input, bytes):
                waveform, actual_sr = decode_audio_bytes(audio_input, sample_rate)
            elif isinstance(audio_input, np.ndarray):
                waveform = audio_input.astype(np.float32)
                if waveform.ndim > 1:
                    waveform = waveform.mean(axis=1)
                # Normalize if int16
                if np.issubdtype(audio_input.dtype, np.integer):
                    waveform = waveform / 32768.0
            else:
                return self._error_result(
                    "decode_failure",
                    ["Unsupported audio input type."],
                    start_time,
                )
        except Exception as e:
            return self._error_result("decode_failure", [f"Audio decode error: {e}"], start_time)

        # 2. Quality screening
        quality: AudioQualityResult = check_audio_quality(waveform, actual_sr)

        if quality.status == "insufficient":
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return {
                "schema_version": schema_version,
                "analysis_status": "insufficient_data",
                "media_type": "audio",
                "model_id": model_id,
                "model_version": model_version,
                "authenticity_assessment": "inconclusive",
                "raw_model_score": None,
                "calibration_status": "uncalibrated",
                "audio_quality": quality.status,
                "duration_seconds": quality.duration_s,
                "snr_db": quality.snr_db,
                "limitations": quality.limitations,
                "acoustic_indicators": None,
                "processing_time_ms": elapsed_ms,
            }

        # 3. Model Availability check
        if not self.is_available:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            limitations = list(quality.limitations)
            if self._init_error:
                limitations.append(self._init_error)
            return {
                "schema_version": schema_version,
                "analysis_status": "model_unavailable",
                "media_type": "audio",
                "model_id": model_id,
                "model_version": model_version,
                "authenticity_assessment": "inconclusive",
                "raw_model_score": None,
                "calibration_status": "uncalibrated",
                "audio_quality": quality.status,
                "duration_seconds": quality.duration_s,
                "snr_db": quality.snr_db,
                "limitations": limitations,
                "acoustic_indicators": None,
                "processing_time_ms": elapsed_ms,
            }

        # 4. Feature extraction
        try:
            features, indicators = extract_acoustic_indicators(waveform, actual_sr)
        except Exception as e:
            return self._error_result(
                "inference_failure",
                [f"Acoustic feature extraction failed: {e}"],
                start_time,
                quality=quality,
            )

        # 5. Neural network inference via ONNX Runtime
        try:
            input_name = self.session.get_inputs()[0].name
            input_tensor = features.reshape(1, -1).astype(np.float32)
            outputs = self.session.run(None, {input_name: input_tensor})

            # Output probabilities shape: (1, 2) where col 1 is P(synthetic)
            prob_output = outputs[1]
            synthetic_prob = float(prob_output[0, 1])
        except Exception as e:
            return self._error_result(
                "inference_failure",
                [f"ONNX neural network inference failed: {e}"],
                start_time,
                quality=quality,
            )

        # 6. Authenticity Assessment Mapping
        thresholds = self.metadata.get("thresholds", {})
        synth_thresh = thresholds.get("synthetic_suspected", 0.65)
        clean_thresh = thresholds.get("no_strong_synthetic_indication", 0.40)

        limitations = list(quality.limitations)

        if quality.status == "degraded":
            # Degraded audio (e.g. high background noise or mild clipping)
            # Cannot make definitive bona-fide claim; downgrade to inconclusive unless synthetic signs are overwhelming
            if synthetic_prob >= 0.85:
                assessment = "synthetic_suspected"
                limitations.append("High confidence synthetic indicators present despite acoustic degradation.")
            else:
                assessment = "inconclusive"
                limitations.append("Degraded audio quality prevents conclusive authenticity assessment.")
        else:
            if synthetic_prob >= synth_thresh:
                assessment = "synthetic_suspected"
            elif synthetic_prob < clean_thresh:
                assessment = "no_strong_synthetic_indication"
            else:
                assessment = "inconclusive"
                limitations.append("Acoustic indicators lie within the ambiguous borderline region [0.40 - 0.65].")

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return {
            "schema_version": schema_version,
            "analysis_status": "completed",
            "media_type": "audio",
            "model_id": model_id,
            "model_version": model_version,
            "authenticity_assessment": assessment,
            "raw_model_score": round(synthetic_prob, 4),
            "calibration_status": "calibrated",
            "audio_quality": quality.status,
            "duration_seconds": quality.duration_s,
            "snr_db": quality.snr_db,
            "limitations": limitations,
            "acoustic_indicators": indicators,
            "processing_time_ms": elapsed_ms,
        }

    def _error_result(
        self,
        status: str,
        limitations: List[str],
        start_time: float,
        quality: Optional[AudioQualityResult] = None,
    ) -> Dict[str, Any]:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "schema_version": 1,
            "analysis_status": status,
            "media_type": "audio",
            "model_id": self.metadata.get("model_id", "aasist-acoustic-guard-v1"),
            "model_version": self.metadata.get("model_version", "1.0.0"),
            "authenticity_assessment": "inconclusive",
            "raw_model_score": None,
            "calibration_status": "uncalibrated",
            "audio_quality": quality.status if quality else "insufficient",
            "duration_seconds": quality.duration_s if quality else 0.0,
            "snr_db": quality.snr_db if quality else 0.0,
            "limitations": limitations,
            "acoustic_indicators": None,
            "processing_time_ms": elapsed_ms,
        }


# Singleton default detector instance
default_deepfake_detector = AudioDeepfakeDetector()
