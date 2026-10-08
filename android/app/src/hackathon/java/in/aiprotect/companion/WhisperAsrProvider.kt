package `in`.aiprotect.companion

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest

object WhisperNative {
    val available: Boolean = try { System.loadLibrary("aiprotect_whisper"); true } catch (_: LinkageError) { false }
    @JvmStatic external fun create(modelPath: String): Long
    @JvmStatic external fun transcribe(handle: Long, samples: FloatArray, language: String, threads: Int): Array<String>
    @JvmStatic external fun cancel(handle: Long)
    @JvmStatic external fun free(handle: Long)
}

/** No runtime downloads. A developer may bundle a pinned model or a user may import one. */
object WhisperModels {
    fun file(context: Context) = File(context.noBackupFilesDir, "whisper-multilingual.bin")
    fun ready(context: Context) = WhisperNative.available && (file(context).isFile || context.assets.list("models")?.contains("whisper.bin") == true)
    suspend fun install(context: Context, uri: Uri? = null): File {
        check(WhisperNative.available) { "This build does not include the multilingual speech engine." }
        require(uri == null || uri.scheme == "content")
        val target = file(context)
        if (uri == null && target.isFile) return target
        val pending = File(context.noBackupFilesDir, "whisper-model.tmp")
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            val source = if (uri == null) context.assets.open("models/whisper.bin") else context.contentResolver.openInputStream(uri)
            requireNotNull(source) { "Cannot read this speech model." }
            source.use { input -> pending.outputStream().use { out ->
                val buffer = ByteArray(32768); var total = 0L
                try {
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer); if (count < 0) break
                        total += count; require(total <= 600L * 1024 * 1024) { "Choose a tiny, base or small model below 600 MB." }
                        digest.update(buffer, 0, count); out.write(buffer, 0, count)
                    }
                    require(total >= 10L * 1024 * 1024) { "This file is not a supported Whisper speech model." }
                } finally { buffer.fill(0) }
            } }
            currentCoroutineContext().ensureActive()
            // The native loader verifies the format and rejects English-only .en weights.
            val handle = WhisperNative.create(pending.absolutePath)
            check(handle != 0L) { "Use multilingual Whisper ggml weights, not an English-only model." }
            WhisperNative.free(handle)
            currentCoroutineContext().ensureActive()
            check(pending.renameTo(target)) { "Could not save the speech model." }
            File(context.noBackupFilesDir, "whisper-model.sha256").writeText(digest.digest().joinToString("") { "%02x".format(it) })
            return target
        } finally { pending.delete() }
    }
}

/** Bounded 30-second CPU windows; native abort callbacks make cancellation real. */
class WhisperAsrProvider(private val context: Context) : MultilingualAsrProvider {
    override val modelId = "whisper.cpp-1.8.3-multilingual"
    private var handle = 0L
    private var cancelled = false
    @Synchronized override fun cancel() { cancelled = true; if (handle != 0L) WhisperNative.cancel(handle) }

    override suspend fun transcribe(pcm: File, language: String, source: String, quality: AudioQuality, progress: (Int) -> Unit): RecordedTranscript {
        val model = WhisperModels.install(context)
        currentCoroutineContext().ensureActive()
        val local = WhisperNative.create(model.absolutePath)
        check(local != 0L) { "The multilingual speech model could not be loaded." }
        synchronized(this) { handle = local; if (cancelled) WhisperNative.cancel(local) }
        val segments = mutableListOf<TranscriptSegment>()
        try {
            RandomAccessFile(pcm, "r").use { input ->
                val windowSamples = 30 * 16000
                var offset = 0L; val totalSamples = pcm.length() / 2
                while (offset < totalSamples) {
                    currentCoroutineContext().ensureActive()
                    val count = minOf(windowSamples.toLong(), totalSamples - offset).toInt()
                    val bytes = ByteArray(count * 2); val samples = FloatArray(count)
                    try {
                        input.seek(offset * 2); input.readFully(bytes)
                        var audible = 0
                        for (i in 0 until count) {
                            val sample = ((bytes[2*i].toInt() and 255) or (bytes[2*i+1].toInt() shl 8)).toShort()
                            samples[i] = sample / 32768f; if (kotlin.math.abs(sample.toInt()) >= 200) audible++
                        }
                        // Never ask Whisper to hallucinate words from a virtually silent window.
                        if (audible >= 800) {
                            val values = WhisperNative.transcribe(local, samples, if (language == "auto") "auto" else language,
                                minOf(4, Runtime.getRuntime().availableProcessors()))
                            currentCoroutineContext().ensureActive()
                            check(values.size % 4 == 0)
                            for (i in values.indices step 4) {
                                val start = (offset * 1000 / 16000 + values[i].toLong()).coerceIn(0, quality.durationMs - 1)
                                val end = (offset * 1000 / 16000 + values[i+1].toLong()).coerceIn(start + 1, quality.durationMs)
                                val text = RecognizedText.normalize(values[i+3]).trim()
                                if (text.isBlank() || (segments.lastOrNull()?.let { end <= it.endMs } == true)) continue
                                val previous = segments.lastOrNull()
                                if (previous != null && start < previous.endMs && previous.text == text) {
                                    segments[segments.lastIndex] = previous.copy(endMs = end); continue
                                }
                                require(text.length <= 1800 && segments.size < 512) { "Too much speech. Choose a shorter recording." }
                                val lang = values[i+2].takeIf { it.matches(Regex("[a-z]{2,3}")) } ?: "unknown"
                                segments.add(TranscriptSegment(maxOf(start, segments.lastOrNull()?.startMs ?: 0), end, text, lang, quality = quality.status))
                            }
                        }
                    } finally { bytes.fill(0); samples.fill(0f) }
                    progress((minOf(totalSamples, offset + count) * 100 / maxOf(1, totalSamples)).toInt())
                    if (offset + count >= totalSamples) break
                    offset += windowSamples - 8000 // Half-second overlap retains boundary context.
                }
            }
        } finally { synchronized(this) { handle = 0; WhisperNative.free(local) } }
        val languages = segments.map { it.language }.toSet()
        val detected = if (languages.size > 1 && languages.all { it in setOf("hi", "en") }) "hi-en" else languages.singleOrNull() ?: language
        val hash = File(context.noBackupFilesDir, "whisper-model.sha256").takeIf { it.isFile }?.readText()?.take(12) ?: "bundled"
        return RecordedTranscript(source, detected, "$modelId/$hash", quality.durationMs, quality.status, segments,
            listOf("Language detection and speech recognition can be wrong; regional-language financial analysis may be incomplete."))
    }
}
