package `in`.aiprotect.companion

import android.net.Uri
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class TranscriptSegment(
    val startMs: Long, val endMs: Long, val text: String, val language: String,
    val speaker: String = "unknown", val quality: String = "adequate", val confidence: Double? = null,
    val userReviewed: Boolean = false
) {
    fun json() = JSONObject().put("start_ms", startMs).put("end_ms", endMs).put("text", text)
        .put("language", language).put("speaker", speaker).put("quality", quality)
        .put("confidence", confidence ?: JSONObject.NULL).put("user_reviewed", userReviewed)
}

data class RecordedTranscript(
    val source: String, val language: String, val modelId: String, val durationMs: Long,
    val quality: String, val segments: List<TranscriptSegment>, val limitations: List<String> = emptyList()
) {
    fun json() = JSONObject().put("schema_version", 1).put("source", source).put("language", language)
        .put("asr_model", modelId).put("duration_ms", durationMs).put("quality", quality)
        .put("segments", JSONArray(segments.map { it.json() })).put("limitations", JSONArray(limitations))
}

interface MultilingualAsrProvider {
    val modelId: String
    suspend fun transcribe(pcm: File, language: String, source: String, quality: AudioQuality, progress: (Int) -> Unit): RecordedTranscript
    fun cancel() = Unit
}

/** Short-lived, process-local preview. Original speech is never written to reports. */
object AudioTranscriptPreview {
    data class Entry(val transcript: RecordedTranscript, val original: Uri?, val expires: Long)
    private val entries = linkedMapOf<String, Entry>()
    private val main = Handler(Looper.getMainLooper())
    private val expire = Runnable { clear() }
    @Synchronized fun put(id: String, transcript: RecordedTranscript, original: Uri?) {
        main.removeCallbacks(expire)
        entries.clear() // One transient recording at a time, bounded to 512 segments.
        entries[id] = Entry(transcript, original, SystemClock.elapsedRealtime() + 15 * 60_000)
        main.postDelayed(expire,15 * 60_000)
    }
    @Synchronized fun get(id: String): Entry? {
        val item = entries[id] ?: return null
        if (item.expires <= SystemClock.elapsedRealtime()) { entries.remove(id); return null }
        return item
    }
    @Synchronized fun delete(id: String) { entries.remove(id) }
    @Synchronized fun clear() { entries.clear(); main.removeCallbacks(expire) }
}
