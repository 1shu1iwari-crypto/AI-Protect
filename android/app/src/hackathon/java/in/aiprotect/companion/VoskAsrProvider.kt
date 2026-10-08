package `in`.aiprotect.companion

import android.content.Context
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject
import org.vosk.LibVosk
import org.vosk.LogLevel
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

class VoskAsrProvider(private val context: Context) : MultilingualAsrProvider {
    override val modelId = "vosk-en-in-0.4-hi-0.22"
    override suspend fun transcribe(pcm: File, language: String, source: String, quality: AudioQuality, progress: (Int) -> Unit): RecordedTranscript {
        require(language in setOf("en", "hi")) { "Choose Hindi or English for the included offline speech model." }
        val directory = OfflineAudioAnalyzer(context).installModel(language)
        currentCoroutineContext().ensureActive(); LibVosk.setLogLevel(LogLevel.WARNINGS)
        val segments = mutableListOf<TranscriptSegment>()
        var total = 0L; var lastEnd = 0L
        fun result(json: String) {
            val value = JSONObject(json); val words = value.optJSONArray("result")
            val text = RecognizedText.normalize(value.optString("text")).trim()
            if (text.isEmpty()) return
            if (words != null && words.length() > 0) {
                var tokens = mutableListOf<String>(); var start = 0L; var end = 0L; var confidence = 0.0
                fun flush() {
                    if (tokens.isEmpty()) return
                    require(segments.size < 512) { "Too many speech segments. Choose a shorter recording." }
                    segments.add(TranscriptSegment(start, maxOf(start + 1, end).coerceAtMost(quality.durationMs),
                        RecognizedText.normalize(tokens.joinToString(" ")), language, quality = quality.status, confidence = confidence / tokens.size))
                    lastEnd = end; tokens = mutableListOf(); confidence = 0.0
                }
                for (i in 0 until words.length()) {
                    val word = words.getJSONObject(i); val token = word.getString("word")
                    if (tokens.sumOf { it.length + 1 } + token.length > 1600) flush()
                    if (tokens.isEmpty()) start = (word.getDouble("start") * 1000).toLong().coerceIn(lastEnd, quality.durationMs - 1)
                    end = (word.getDouble("end") * 1000).toLong().coerceIn(start + 1, quality.durationMs)
                    tokens.add(token); confidence += word.optDouble("conf", 0.0).coerceIn(0.0, 1.0)
                }
                flush()
            } else {
                // Older recognizers still produce bounded, time-addressable utterances.
                val end = (total * 1000 / 32000).coerceIn(lastEnd + 1, quality.durationMs)
                for (part in text.chunked(1600)) {
                    require(segments.size < 512)
                    segments.add(TranscriptSegment(lastEnd, end, part, language, quality = quality.status))
                }
                lastEnd = end
            }
        }
        Model(directory.absolutePath).use { model -> Recognizer(model, 16000f).use { recognizer ->
            recognizer.setWords(true)
            pcm.inputStream().use { input ->
                val buffer = ByteArray(8000); var last = -1
                try {
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer); if (count < 0) break
                        total += count
                        if (recognizer.acceptWaveForm(buffer, count)) result(recognizer.result)
                        val percent = (100 * total / maxOf(1, pcm.length())).toInt()
                        if (percent != last) { progress(percent); last = percent }
                    }
                    result(recognizer.finalResult)
                } finally { buffer.fill(0) }
            }
        } }
        return RecordedTranscript(source, language, "$modelId/$language", quality.durationMs, quality.status, segments,
            listOf("Vosk uses the selected language; it does not automatically identify code-mixed speech."))
    }
}
