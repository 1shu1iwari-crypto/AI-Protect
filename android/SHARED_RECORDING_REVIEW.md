# Share a recording to AI-Protect

## Everyday use

Install the **Hackathon/MVP** build. In Recorder, WhatsApp or Files, share **one audio attachment** to AI-Protect. Choose Hindi or English (or Automatic when a multilingual Whisper model is installed), then tap **Analyze this recording**. Arrival alone never starts a review. Imported recordings need no microphone, accessibility, call-log, contacts or broad storage permission. Notifications are optional; the result remains available in the app.

The foreground service decodes supported audio, screens energy/clipping, transcribes locally and runs the existing financial-intent/workflow engine. A progress notification offers cancellation. The report distinguishes:

- **Financial request:** high risk, needs review, no strong signs, or inconclusive.
- **Voice authenticity:** inconclusive unless a separately evaluated detector is available. The Android build currently has no validated native acoustic model.
- **Caller identity:** unverified. Neither a natural voice nor an official-domain mention authenticates a caller.

Results explain the evidence and offer independent verification, trusted-person sharing, redacted JSON export, offline Hindi/English text-to-speech, and response routes selected after **Did you already send money?** A negative result explicitly does not establish safety.

## What is implemented

| Capability | Status |
|---|---|
| Android `ACTION_SEND` audio / application-ogg receiver | Implemented in the MVP flavor; Play does not advertise an unsupported audio target |
| `EXTRA_STREAM` and single-item ClipData content URIs | Supported, grant forwarded to the processing service |
| File validation | Metadata check before consent; bounded copy and actual MediaExtractor/MediaCodec validation after consent |
| Input bounds | 60 MB, 10 minutes, 512 segments, 1,800 characters per segment, 150,000 characters per transcript |
| Included offline ASR | Vosk Hindi 0.22 / Indian English 0.4, with word-derived timestamps and mean ASR confidence |
| Optional multilingual ASR | Real whisper.cpp JNI CPU provider, original-language transcription, auto language selection, 30-second windows with overlap and native cancellation |
| Speech quality | Streaming energy/clipping gate and silent-window avoidance; this is not a learned Silero VAD or an authenticity detector |
| Financial reasoning | Existing `core/` engine; a recorded review explains high-risk *requests* without fabricating an executed payment |
| Regional-language transcription | Whisper can emit regional languages; financial reasoning outside Hindi/English/Hinglish is explicitly incomplete/inconclusive |
| Speech inspection | Local timestamped preview, original-file replay when its URI remains readable, text correction and Me / Other person / Unknown attribution |
| Speaker diarization | Not implemented. Unknown speakers are never automatically identified as a scammer |
| Validated voice-clone inference | Not installed. The procedural Python model is quarantined as experimental |
| Advanced cloud analysis | Not implemented in the Android path; no recording is uploaded |

## Build

The existing Vosk-only MVP remains the lightweight fallback:

```bash
cd android
./gradlew :app:assembleHackathonDebug :app:testHackathonDebugUnitTest :app:lintHackathonDebug
```

For real multilingual Whisper support, clone the **pinned** source outside this repository. Gradle uses NDK 27.0.12077973 and CMake 3.22.1; Android Studio/SDK must have them installed or be able to download them.

```bash
git clone https://github.com/ggml-org/whisper.cpp.git ../whisper.cpp
git -C ../whisper.cpp checkout 2eeeba56e9edd762b4b38467bab96c2517163158
cd android
./gradlew :app:assembleHackathonDebug -PwhisperCppDir="$PWD/../../whisper.cpp"
```

This compiles the actual native provider but does not invent or download model weights at runtime. Use **More options → Add a multilingual offline speech model** to import trusted multilingual ggml `tiny`, `base`, or another supported model below 600 MB. English-only `.en` models are rejected by `whisper_is_multilingual`.

For an APK that works immediately without model setup, bundle a reviewed multilingual ggml file at build time:

```bash
./gradlew :app:assembleHackathonDebug \
  -PwhisperCppDir="/absolute/path/to/whisper.cpp" \
  -PwhisperModelFile="/absolute/path/to/ggml-tiny.bin"
```

Obtain weights from the [official whisper.cpp models documentation](https://github.com/ggml-org/whisper.cpp/tree/v1.8.3/models), verify their published hash, and record the hash with the release. The import path computes SHA-256, validates the native model before replacing an installed one, and records the model fingerprint in review provenance. No microphone is used for model installation. Model weights stay installed until removed with app data; temporary *recordings* are separate.

Whisper is preferred when native code and multilingual weights are available. If it fails and the user selected Hindi or English, Vosk can retry locally with its model ID shown in the result. Automatic language selection never silently falls back to English. Transcription quality and low-end-device speed still need real-device benchmarking.

## Data and lifecycle

- Source files are never modified. Imports are copied via ContentResolver after explicit consent; expired/unreadable grants request a fresh share.
- Raw input and PCM live only under backup-excluded `audio-work`. They are deleted on success, failure or cancellation; interrupted-work cleanup runs the next time recording review opens. Android force-stop cannot execute cleanup immediately.
- A full transcript is held only in a bounded process-local preview, cleared on leaving the screen, replacement, explicit deletion, process death or a 15-minute timer. It is never added to ReviewStore, AudioReportStore, fingerprints or exports. Immutable runtime strings are subject to normal garbage collection; this is not a forensic memory-erasure claim.
- Persisted reports expire when read after 24 hours and retain only derived factors, model identity, coarse financial frames, speaker enums, evidence offsets and action plans. At most ten reports are retained; review timelines also obey the native size cap.
- Imported-file replay uses the original granted URI and can become unavailable when the source grant is revoked. Microphone PCM is deleted after analysis, so it has no persistent replay asset.
- Transcript corrections recompute the review locally; prior reports remain intact if correction fails or is cancelled.
- Foreground processing uses `mediaProcessing` on API 35, `dataSync` on API 33–34, and `microphone` only during explicit recording. Cancellation invokes Whisper's native abort callback as well as coroutine cancellation; both foreground-service timeout callbacks stop the job.
- No `10.0.2.2`, HTTP media upload, Base64 audio request, or Internet permission exists in the Android recording path.

## Structured transcript

```json
{
  "schema_version": 1,
  "source": "shared_recording",
  "language": "hi-en",
  "asr_model": "selected-provider-and-model-version",
  "duration_ms": 6000,
  "quality": "adequate",
  "segments": [
    {
      "start_ms": 1200,
      "end_ms": 5400,
      "speaker": "unknown",
      "text": "Original recognized words, held locally only",
      "language": "hi-en",
      "quality": "adequate",
      "confidence": null,
      "user_reviewed": false
    }
  ]
}
```

Low-confidence segments are excluded until corrected by the user. Me segments are excluded from requested-action analysis. Original-language words and negation are preserved; no English translation replaces the evidence. Confidence describes ASR words when available, not a scam probability. Missing coverage produces inconclusive rather than a safety claim.

## Benchmarks and physical-device acceptance

`ml/asr/evaluate_asr.py` scores an independently labeled JSONL manifest of actual ASR hypotheses against original-language references. Put private source manifests under ignored `data/`, not in git. Rows contain `id`, `language`, `model`, `reference`, `hypothesis`, optional `critical_terms` (negations, credential words, amounts), `latency_ms`, and `device`.

```bash
python ml/asr/evaluate_asr.py data/asr-hypotheses.jsonl --output evaluation/asr-real-results.json
```

Report WER/CER and critical-term preservation by language/provider, and inspect speaker attribution and number/negation errors manually. Empty output counts as errors. This feature does **not** ship a claimed real-call benchmark score.

Before a consumer release, record the following on physical low-end Android phones; JVM/browser checks do not substitute for these device tests:

| Recording / condition | Required result |
|---|---|
| MP3, WAV, M4A; OGG/Opus where the device decoder supports it | Share from Recorder/Files/WhatsApp; inspect actual decoded duration and timestamps |
| Hindi and Hinglish scam request | Real transcript and financial verdict; original unchanged; unsupported words inspectable |
| Harmless banking advisory / refusal | No fabricated credential or transfer request; no "safe caller" claim |
| Silence, noise, clipping, truncated codec file | Inconclusive or clear processing failure; no successful safety verdict |
| Airplane mode | Included speech model and financial review work without network |
| Missing / incompatible Whisper model | Selected-language fallback or clear setup/failure message; auto never assumes English |
| Notifications denied | Import completes and report is visible in the app |
| Revoked content grant / no EXTRA_STREAM / duplicate share | Graceful error; no background analysis without a fresh tap |
| Cancel during copy, decode, Vosk or Whisper | Processing stops, no new verdict, temporary input/PCM removed |
| App killed during review | No resumed consent or false completed report; interrupted-work cleanup on next launch |
| Correct an omitted "not" / mark recipient speech Me | Fresh derived review; unchanged original and no full speech in export |
| Money already sent | Bank/PSP contact, 1930 and official cybercrime reporting; no additional payment to recover funds |

## References and licences

- [Android receiving shared data](https://developer.android.com/training/sharing/receive) and [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types).
- [whisper.cpp Android example](https://github.com/ggml-org/whisper.cpp/tree/v1.8.3/examples/whisper.android), native code MIT; Whisper weights MIT. Keep the upstream notices with bundled weights/code. Vosk notices remain in `assets/notices/`.
- [Official AASIST / AASIST-L](https://github.com/clovaai/aasist) and [paper](https://arxiv.org/abs/2110.01200): genuine anti-spoofing research reference, **not** the bundled procedural MLP.
- [ASVspoof 2021](https://www.asvspoof.org/index2021.html): real bona-fide/spoofed corpora and evaluation keys; inspect dataset licences and speaker/generator splits. Published benchmark results do not establish Hindi/Hinglish telephony performance.

A future native acoustic provider must use genuine pretrained/real-speech-trained weights, independently evaluated preprocessing/thresholds, versioned provenance and an inconclusive state. The current 84-feature procedural ONNX graph must not be relabeled as AASIST or loaded with raw-waveform AASIST weights, which use a different input contract.
