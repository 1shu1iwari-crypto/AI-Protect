package `in`.aiprotect.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Internal, backup-excluded, redacted state only. Raw shares are never written here. */
class ReviewStore(context: Context) {
    private val file = File(context.noBackupFilesDir, "reviews.json")
    @Synchronized fun read(): String = try {
        val state = JSONObject(file.readText())
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
        require(raw.length <= 512_000)
        val state = JSONObject(raw)
        require((state.optJSONArray("reviews")?.length() ?: 0) <= 10)
        // The only caller is the packaged, network-isolated review module, which
        // serializes derived events, enum signals, coarse amounts and fixed prose.
        file.writeText(state.toString())
    }
}
