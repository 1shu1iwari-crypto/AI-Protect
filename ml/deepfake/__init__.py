"""AI-Protect Acoustic Anti-Spoofing & Deepfake Detection Package."""

from .detector import AudioDeepfakeDetector, default_deepfake_detector
from .features import (
    AudioQualityResult,
    check_audio_quality,
    decode_audio_bytes,
    extract_acoustic_indicators,
    extract_lfcc,
)

__all__ = [
    "AudioDeepfakeDetector",
    "default_deepfake_detector",
    "AudioQualityResult",
    "check_audio_quality",
    "decode_audio_bytes",
    "extract_acoustic_indicators",
    "extract_lfcc",
]
