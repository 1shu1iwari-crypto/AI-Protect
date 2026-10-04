package `in`.aiprotect.companion

import android.content.Context
import org.json.JSONArray
import java.io.File

/** Internal, backup-excluded, redacted state only. Raw shares are never written here. */
class ReviewStore(context: Context) {
    private val file = File(context.noBackupFilesDir, "reviews.json")
    @Synchronized fun read(): String = try {
        val state = ReviewSnapshotPolicy.sanitize(file.readText())
        val kept = JSONArray()
        val reviews = state.optJSONArray("reviews") ?: JSONArray()
        for (i in 0 until reviews.length()) {
            val review = reviews.getJSONObject(i)
            val age = System.currentTimeMillis() - review.optLong("started")
            if (age in 0..86_400_000) kept.put(review)
        }
        state.put("reviews", kept)
        if (kept.length() == 0) { file.delete(); "{}" } else state.toString().also { file.writeText(it) }
    } catch (_: Exception) { file.delete(); "{}" }
    @Synchronized fun write(raw: String) {
        val state = ReviewSnapshotPolicy.sanitize(raw)
        // Native storage independently drops unknown fields and source prose.
        // JavaScript rebuilds explanations from the preserved derived evidence.
        file.writeText(state.toString())
    }
}
